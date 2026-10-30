import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  contentActor,
  createAccessRepository,
  createQuestionRepository,
  migrateDatabase,
  openDatabase,
} from '@mamalik/database';
import { createGameService } from '../src/server.js';
import { createContentAuthenticator } from '../src/content-auth.js';
import { startAuthFixture } from './support/auth-server.js';

const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:admin');
const database = openDatabase(url);
const access = createAccessRepository(database.db);
const questions = createQuestionRepository(database.db);
const editor = randomUUID(),
  reviewer = randomUUID(),
  publisher = randomUUID(),
  ordinary = randomUUID();
let auth: Awaited<ReturnType<typeof startAuthFixture>>;
let service: ReturnType<typeof createGameService>;
let base = '';
const content = {
  locale: 'ar',
  category: 'الفضاء',
  text: 'أي كوكب هو الأقرب إلى الشمس؟',
  choices: [
    { id: 'a', text: 'عطارد' },
    { id: 'b', text: 'الأرض' },
    { id: 'c', text: 'المريخ' },
    { id: 'd', text: 'زحل' },
  ],
  correctChoiceId: 'a',
  explanation: 'عطارد أول الكواكب قربًا من الشمس.',
  sources: [
    { label: 'NASA', url: 'https://science.nasa.gov/solar-system/planets/' },
  ],
};
const who = (subject: string) => ({ issuer: auth.issuer, subject });
async function call(
  subject: string | null,
  path: string,
  command?: unknown,
  key = randomUUID(),
) {
  const headers: Record<string, string> = {};
  if (subject)
    headers.Authorization = `Bearer ${await auth.token(subject, { forgedRoles: subject === ordinary })}`;
  if (command) {
    headers['Content-Type'] = 'application/json';
    headers['Idempotency-Key'] = key;
  }
  return fetch(`${base}${path}`, {
    method: command ? 'POST' : 'GET',
    headers,
    ...(command ? { body: JSON.stringify(command) } : {}),
  });
}
beforeAll(async () => {
  await migrateDatabase(database.db);
  auth = await startAuthFixture();
  await access.grant(who(editor), 'editor', 'test-operator');
  await access.grant(who(reviewer), 'reviewer', 'test-operator');
  await access.grant(who(publisher), 'publisher', 'test-operator');
  service = createGameService(
    {},
    {
      db: database.db,
      authenticate: createContentAuthenticator(auth.url, auth.key),
    },
  );
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server?.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing service address');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await service?.gracefullyShutdown(false);
  await auth?.close();
  await database.close();
});

describe('authenticated content HTTP + real PostgreSQL', () => {
  it('keeps anonymous/player requests away from drafts and secret content', async () => {
    const before = await questions.list();
    const missing = await call(null, '/admin/questions');
    expect(missing.status).toBe(401);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect(await missing.json()).toEqual({ error: 'UNAUTHENTICATED' });
    expect((await call(ordinary, '/admin/questions')).status).toBe(403);
    expect(
      (
        await call(ordinary, '/admin/commands', {
          type: 'CREATE_DRAFT',
          content,
        })
      ).status,
    ).toBe(403);
    expect(await questions.list()).toEqual(before);
    const me = await call(ordinary, '/admin/me');
    expect(await me.json()).toMatchObject({ subject: ordinary, roles: [] });
  });
  it('enforces editor/reviewer/publisher separation and derives audit actors', async () => {
    const created = await call(editor, '/admin/commands', {
      type: 'CREATE_DRAFT',
      content,
    });
    expect(created.status).toBe(201);
    const value = (await created.json()) as {
      questionId: string;
      revision: number;
    };
    expect(value.revision).toBe(1);
    const id = value.questionId;
    const detail = await call(reviewer, `/admin/questions/${id}/revisions/1`);
    expect(await detail.json()).toMatchObject({ content });
    const approve = {
      type: 'APPROVE',
      questionId: id,
      revision: 1,
      note: 'Local integration fixture review',
    };
    expect((await call(editor, '/admin/commands', approve)).status).toBe(403);
    await access.grant(who(editor), 'reviewer', 'test-operator');
    const self = await call(editor, '/admin/commands', approve);
    expect(self.status).toBe(409);
    expect(await self.json()).toEqual({ error: 'SELF_REVIEW' });
    expect((await call(reviewer, '/admin/commands', approve)).status).toBe(200);
    const publish = { type: 'PUBLISH', questionId: id, revision: 1 };
    expect((await call(reviewer, '/admin/commands', publish)).status).toBe(403);
    expect((await call(publisher, '/admin/commands', publish)).status).toBe(
      200,
    );
    const history = await questions.history(id);
    expect(history.map((row) => row.actor)).toEqual([
      contentActor(who(editor)),
      contentActor(who(reviewer)),
      contentActor(who(publisher)),
    ]);
    expect(
      (await questions.loadPublished()).find((row) => row.questionId === id)
        ?.content.correctChoiceId,
    ).toBe('a');
  });
  it('rejects injected authors/roles, malformed commands and body abuse without mutations', async () => {
    const before = await questions.list();
    for (const command of [
      { type: 'CREATE_DRAFT', content, author: reviewer },
      { type: 'CREATE_DRAFT', content, role: 'publisher' },
      { type: 'CREATE_DRAFT', content: { ...content, correctChoiceId: 'z' } },
    ])
      expect((await call(editor, '/admin/commands', command)).status).toBe(400);
    const headers = {
      Authorization: `Bearer ${await auth.token(editor)}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    };
    const invalid = await fetch(`${base}/admin/commands`, {
      method: 'POST',
      headers,
      body: '{invalid',
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'INVALID_JSON' });
    expect(
      (
        await fetch(`${base}/admin/commands`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ excess: 'x'.repeat(17_000) }),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await fetch(`${base}/admin/commands`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'text/plain' },
          body: '{}',
        })
      ).status,
    ).toBe(415);
    expect(await questions.list()).toEqual(before);
  });
  it('deduplicates concurrent retries and rejects key reuse for different content', async () => {
    const key = randomUUID();
    const command = { type: 'CREATE_DRAFT', content };
    const [one, two] = await Promise.all([
      call(editor, '/admin/commands', command, key),
      call(editor, '/admin/commands', command, key),
    ]);
    expect([one.status, two.status]).toEqual([201, 201]);
    const first = z
      .object({
        questionId: z.uuid(),
        revision: z.number(),
        created: z.boolean(),
      })
      .parse(await one.json());
    expect(await two.json()).toEqual(first);
    expect(await questions.history(first.questionId)).toHaveLength(1);
    const conflict = await call(
      editor,
      '/admin/commands',
      { type: 'CREATE_DRAFT', content: { ...content, text: 'نص مختلف' } },
      key,
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'IDEMPOTENCY_CONFLICT' });
  });
  it('sees role revocation immediately on the next request, including retries', async () => {
    const subject = randomUUID();
    await access.grant(who(subject), 'editor', 'operator');
    const key = randomUUID();
    const headers = {
      Authorization: `Bearer ${await auth.token(subject)}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    };
    const submit = () =>
      fetch(`${base}/admin/commands`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'CREATE_DRAFT', content }),
      });
    expect((await submit()).status).toBe(201);
    await access.revoke(who(subject), 'editor', 'operator');
    expect((await fetch(`${base}/admin/questions`, { headers })).status).toBe(
      403,
    );
    expect((await submit()).status).toBe(403);
    await access.grant(
      { issuer: 'https://other.example/auth/v1', subject },
      'publisher',
      'operator',
    );
    expect((await call(subject, '/admin/questions')).status).toBe(403);
  });
  it('blocks browser-origin calls and ignores cookie/query token attempts', async () => {
    const token = await auth.token(editor);
    expect(
      (
        await fetch(`${base}/admin/questions?access_token=${token}`, {
          headers: { Cookie: `access_token=${token}` },
        })
      ).status,
    ).toBe(401);
    const origin = await fetch(`${base}/admin/questions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: 'https://untrusted.example',
      },
    });
    expect(origin.status).toBe(403);
    expect(origin.headers.get('access-control-allow-origin')).toBeNull();
    expect((await call(editor, '/admin/questions?limit=101')).status).toBe(400);
    expect(
      (await call(editor, '/admin/questions?limit=1&offset=0')).status,
    ).toBe(200);
  });
  it('rate limits the admin boundary before additional Auth requests', async () => {
    const before = auth.calls();
    const statuses: number[] = [];
    for (let index = 0; index < 65; index++)
      statuses.push((await call(null, '/admin/me')).status);
    expect(statuses).toContain(429);
    expect(auth.calls()).toBe(before);
  });
});
