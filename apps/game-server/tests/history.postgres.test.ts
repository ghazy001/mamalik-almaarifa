import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createMatchHistoryRepository,
  createMatchResultRepository,
  migrateDatabase,
  openDatabase,
} from '@mamalik/database';
import { matchHistoryPageSchema } from '@mamalik/shared';
import { createGameService } from '../src/server.js';
import { createPlayerAccess } from '../src/player-access.js';
import { createPlayerHistory } from '../src/player-history.js';
import { createContentAuthenticator } from '../src/content-auth.js';
import { startAuthFixture } from './support/auth-server.js';
import { finishedArchive } from './support/result-fixture.js';
import { createServerMatch } from '../src/match-session.js';
const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:history');
const database = openDatabase(url);
const repository = createMatchResultRepository(database.db);
let auth: Awaited<ReturnType<typeof startAuthFixture>>;
let service: ReturnType<typeof createGameService>;
const owner = randomUUID(),
  other = randomUUID();
let base = '',
  fail = false;
beforeAll(async () => {
  await migrateDatabase(database.db);
  await migrateDatabase(database.db);
  auth = await startAuthFixture();
  const history = createPlayerHistory(database.db);
  service = createGameService(
    {
      playerAccess: createPlayerAccess(
        createContentAuthenticator(auth.url, auth.key),
      ),
    },
    undefined,
    async (...args) => {
      if (fail) throw new Error('private database failure canary');
      return history(...args);
    },
  );
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server!.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await service?.gracefullyShutdown(false);
  await auth?.close();
  await database.close();
});
async function read(user = owner, query = '') {
  return fetch(`${base}/player/history${query}`, {
    headers: { Authorization: `Bearer ${await auth.token(user)}` },
  });
}
it('requires fresh verified identity and rejects client identity/limit selectors and browser origins', async () => {
  expect((await fetch(`${base}/player/history`)).status).toBe(401);
  expect(
    (
      await fetch(`${base}/player/history`, {
        headers: { Authorization: 'Bearer a.b.c' },
      })
    ).status,
  ).toBe(401);
  for (const query of [
    '?subject=victim',
    '?issuer=https://untrusted.example',
    '?limit=100',
    '?offset=20',
    '?cursor=a&cursor=b',
    '?cursor=abc',
    '?cursor=../secret',
  ])
    expect((await read(owner, query)).status).toBe(400);
  expect(
    (
      await fetch(`${base}/player/history`, {
        headers: {
          Authorization: `Bearer ${await auth.token(owner)}`,
          Origin: 'https://untrusted.example',
        },
      })
    ).status,
  ).toBe(403);
  const empty = await read();
  expect(empty.headers.get('cache-control')).toContain('no-store');
  expect(await empty.json()).toEqual({ items: [], nextCursor: null });
});
it('paginates exact microseconds and timestamp ties without leaking guests or another identity', async () => {
  const seed = finishedArchive();
  const owned: { id: string; at: string }[] = [];
  for (let index = 0; index < 27; index++)
    owned.push({
      id: `m_page_${String(index).padStart(2, '0')}`,
      at:
        index === 25
          ? '2020-01-01T10:00:00.123457Z'
          : index === 26
            ? '2020-01-01T10:00:00.123455Z'
            : '2020-01-01T10:00:00.123456Z',
    });
  // Trusted test fixtures force microsecond/tie boundaries without mutable timestamps.
  await database.db.transaction(async (tx) => {
    for (const row of [
      ...owned,
      { id: 'm_foreign', at: owned[0]!.at },
      { id: 'm_same_uuid_other_issuer', at: owned[0]!.at },
      { id: 'm_guest_only', at: owned[0]!.at },
    ]) {
      await tx.execute(
        sql`INSERT INTO game.match_results (match_id, payload_hash, archive, recorded_at) VALUES (${row.id}, repeat('a', 64), ${JSON.stringify({ ...seed, matchId: row.id })}::jsonb, ${row.at}::timestamptz)`,
      );
      if (row.id !== 'm_guest_only')
        await tx.execute(
          sql`INSERT INTO game.result_participants (match_id, player_id, issuer, subject) VALUES (${row.id}, 'p_teal', ${row.id === 'm_same_uuid_other_issuer' ? 'https://other-project.example/auth/v1' : auth.issuer}, ${row.id === 'm_foreign' ? other : owner})`,
        );
    }
  });
  const response = await read();
  const first = matchHistoryPageSchema.parse(await response.json());
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).not.toBeNull();
  expect(first.items[0]!.recordedAt).toBe('2020-01-01T10:00:00.123457Z');
  // A later committed result appears on refresh, without duplicating the next page.
  await repository.write({ ...seed, matchId: 'm_newer' }, [
    { issuer: auth.issuer, subject: owner, playerId: 'p_teal' },
  ]);
  const second = matchHistoryPageSchema.parse(
    await (await read(owner, `?cursor=${first.nextCursor}`)).json(),
  );
  expect(second.items).toHaveLength(7);
  expect(second.nextCursor).toBeNull();
  const actual = [...first.items, ...second.items].map((item) => item.matchId);
  const expected = owned
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : a.id > b.id ? -1 : 1))
    .map((row) => row.id);
  expect(actual).toEqual(expected);
  expect(new Set(actual).size).toBe(27);
  expect(second.items.at(-1)!.recordedAt).toBe('2020-01-01T10:00:00.123455Z');
  expect(
    matchHistoryPageSchema.parse(await (await read()).json()).items[0]!.matchId,
  ).toBe('m_newer');
  const foreign = matchHistoryPageSchema.parse(
    await (await read(other)).json(),
  );
  expect(foreign.items.map((item) => item.matchId)).toEqual(['m_foreign']);
  const realm = await createMatchHistoryRepository(database.db).listFor({
    issuer: 'https://other-project.example/auth/v1',
    subject: owner,
  });
  expect(realm.records.map((item) => item.matchId)).toEqual([
    'm_same_uuid_other_issuer',
  ]);
  expect(JSON.stringify(first)).not.toMatch(
    new RegExp(
      `${owner}|${other}|issuer|subject|bankHash|seed|question|accepted|token|guest-name`,
    ),
  );
});
it('projects only the viewer placement, including shared wins, loss and prepared-match abort', async () => {
  const user = randomUUID();
  const session = createServerMatch({
    id: 'm_outcome_win',
    seed: 2026,
    rules: { maxTurns: 1 },
    players: ['p_teal', 'p_blue', 'p_gold'].map((id) => ({
      id,
      name: 'private-name-canary',
    })),
  });
  session.forfeit('p_blue', 0); // A prepared lobby abort is deliberately not a victory.
  const aborted = {
    ...session.archive()!,
    mode: 'private',
    questionSource: 'development',
  };
  await repository.write(aborted, [
    { issuer: auth.issuer, subject: user, playerId: 'p_teal' },
  ]);
  const shared = { ...finishedArchive(), matchId: 'm_outcome_shared' };
  await repository.write(shared, [
    { issuer: auth.issuer, subject: user, playerId: 'p_blue' },
  ]);
  const match = createServerMatch({
    id: 'm_outcome_finished',
    seed: 2026,
    players: ['p_teal', 'p_blue', 'p_gold'].map((id) => ({
      id,
      name: 'private-name-canary',
    })),
  });
  for (const playerId of ['p_teal', 'p_blue', 'p_gold'])
    match.command(
      {
        protocolVersion: 3,
        type: 'READY',
        matchId: 'm_outcome_finished',
        turn: 0,
        idempotencyKey: 'ready',
      },
      playerId,
      0,
    );
  match.forfeit('p_blue', 1);
  match.forfeit('p_gold', 2);
  const won = {
    ...match.archive()!,
    mode: 'matchmaking',
    questionSource: 'development',
  };
  await repository.write(won, [
    { issuer: auth.issuer, subject: user, playerId: 'p_teal' },
    { issuer: auth.issuer, subject: other, playerId: 'p_blue' },
  ]);
  const page = matchHistoryPageSchema.parse(await (await read(user)).json());
  expect(
    page.items.find((item) => item.matchId === 'm_outcome_win')?.outcome,
  ).toBe('aborted');
  expect(
    page.items.find((item) => item.matchId === 'm_outcome_shared')?.outcome,
  ).toBe('shared');
  expect(
    page.items.find((item) => item.matchId === 'm_outcome_finished'),
  ).toMatchObject({ outcome: 'won', rank: 1, score: 3, castles: 1 });
  const loss = matchHistoryPageSchema
    .parse(await (await read(other)).json())
    .items.find((item) => item.matchId === 'm_outcome_finished');
  expect(loss).toMatchObject({ outcome: 'lost', eliminated: true, score: 0 });
});
it('fails closed after provider revocation or database failure without changing stored results', async () => {
  auth.revoked.add(owner);
  try {
    expect((await read()).status).toBe(401);
  } finally {
    auth.revoked.delete(owner);
  }
  fail = true;
  try {
    const response = await read();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"HISTORY_UNAVAILABLE"}');
  } finally {
    fail = false;
  }
  expect((await read()).status).toBe(200);
  expect(await repository.get('m_newer')).not.toBeNull();
});
