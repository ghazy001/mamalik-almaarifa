import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import {
  createMatchResultRepository,
  createQuestionRepository,
  matchArchiveSchema,
  migrateDatabase,
  openDatabase,
} from '@mamalik/database';
import { PROTOCOL_VERSION, roomSnapshotSchema } from '@mamalik/shared';
import type { RoomSnapshot } from '@mamalik/shared';
import { createGameService } from '../src/server.js';
import { databaseQuestionLoader } from '../src/question-bank.js';
import { createResultWriter } from '../src/result-writer.js';
import { finishedArchive } from './support/result-fixture.js';

const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:results');
const database = openDatabase(url);
const results = createMatchResultRepository(database.db);
const questions = createQuestionRepository(database.db);
const content = {
  locale: 'ar',
  category: 'اختبار النتائج',
  text: 'سؤال خاص لاختبار حفظ النتيجة؟',
  choices: [
    { id: 'a', text: 'أول' },
    { id: 'b', text: 'ثان' },
    { id: 'c', text: 'ثالث' },
    { id: 'd', text: 'رابع' },
  ],
  correctChoiceId: 'b',
  explanation: 'private-answer-explanation-canary',
  sources: [
    { label: 'private-source-canary', url: 'https://example.org/fixture' },
  ],
};
let release: (() => void) | null = null;
let gate = Promise.resolve();
let fail = false;
let writes = 0;
const writer = createResultWriter(
  async (archive) => {
    writes++;
    await gate;
    if (fail) throw new Error('private DB failure detail');
    return results.write(archive);
  },
  async () => {},
);
const service = createGameService({
  seed: 2026,
  rules: { maxTurns: 1, selectionMs: 5000, answerMs: 2000 },
  resolutionMs: 100,
  loadQuestions: databaseQuestionLoader(database.db),
  resultWriter: writer,
});
let endpoint = '',
  publishedId = '',
  stopped = false;
const clients: Room[] = [];
beforeAll(async () => {
  await migrateDatabase(database.db);
  await migrateDatabase(database.db);
  const question = await questions.createDraft(content, 'test-editor');
  publishedId = question.questionId;
  await questions.approve(publishedId, 1, 'test-reviewer', 'Test-only review');
  await questions.publish(publishedId, 1, 'test-publisher');
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server?.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  release?.();
  await Promise.all(clients.map((client) => client.leave().catch(() => {})));
  if (!stopped) await service.gracefullyShutdown(false);
  await writer.drain();
  await database.close();
});
function observe(room: Room) {
  let current: RoomSnapshot | null = null;
  const callbacks = new Set<() => void>();
  room.onMessage('snapshot', (input: unknown) => {
    current = roomSnapshotSchema.parse(input);
    for (const callback of callbacks) callback();
  });
  room.onMessage('clock', () => {});
  room.onMessage('event', () => {});
  return {
    get: () => current!,
    wait(check: (value: RoomSnapshot) => boolean): Promise<RoomSnapshot> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          callbacks.delete(inspect);
          reject(new Error('Snapshot timeout'));
        }, 10000);
        function inspect() {
          if (current && check(current)) {
            clearTimeout(timer);
            callbacks.delete(inspect);
            resolve(current);
          }
        }
        callbacks.add(inspect);
        inspect();
        room.send('sync', { nonce: 'result_test' });
      });
    },
  };
}
async function group(mode: 'kingdom' | 'kingdom_queue' = 'kingdom') {
  const first = await new Client(endpoint).create(mode, {
    name: 'guest-name-canary',
  });
  const rooms = [first];
  const views = [observe(first)];
  for (const name of ['guest-two-canary', 'guest-three-canary']) {
    const joined = await new Client(endpoint).joinById(first.roomId, { name });
    rooms.push(joined);
    views.push(observe(joined));
  }
  clients.push(...rooms);
  await Promise.all(
    views.map((view) => view.wait((value) => value.state?.phase === 'LOBBY')),
  );
  const matchId = views[0]!.get().state!.matchId;
  const send = (index: number, type: string, fields = {}) =>
    rooms[index]!.send('command', {
      protocolVersion: PROTOCOL_VERSION,
      type,
      matchId,
      turn: views[index]!.get().state!.turn,
      idempotencyKey: `${type}_${views[index]!.get().state!.turn}`,
      ...fields,
    });
  return { rooms, views, matchId, send };
}
it('commits one immutable archive across concurrent duplicate writes and detects conflicts', async () => {
  const archive = finishedArchive();
  const outcomes = await Promise.all(
    Array.from({ length: 6 }, () => results.write(archive)),
  );
  expect(outcomes.filter((value) => value.created)).toHaveLength(1);
  const before = await results.get(archive.matchId);
  expect(before?.archive).toEqual(archive);
  expect(
    await results.write({ ...archive, rules: { ...archive.rules } }),
  ).toEqual({ created: false });
  expect((await results.get(archive.matchId))?.recordedAt).toEqual(
    before?.recordedAt,
  );
  await expect(results.write({ ...archive, seed: 1 })).rejects.toMatchObject({
    message: 'MATCH_ARCHIVE_CONFLICT',
  });
  expect((await results.get(archive.matchId))?.archive).toEqual(archive);
  // A separate pool can read the committed record, independent of room/process memory.
  const reopened = openDatabase(url!);
  try {
    expect(
      (await createMatchResultRepository(reopened.db).get(archive.matchId))
        ?.archive,
    ).toEqual(archive);
  } finally {
    await reopened.close();
  }
});
it('rolls back the archive header when a published revision reference fails', async () => {
  const archive = {
    ...finishedArchive(),
    matchId: 'm_missing_revision',
    questionSource: 'published',
    usedQuestionIds: [`${randomUUID()}_v1`],
  };
  await expect(results.write(archive)).rejects.toMatchObject({
    cause: { code: '23503' },
  });
  expect(await results.get(archive.matchId)).toBeNull();
  const rows = await database.db.execute(
    sql`SELECT * FROM game.result_questions WHERE match_id = ${archive.matchId}`,
  );
  expect(rows.rows).toHaveLength(0);
});
it('retains exact retired revision references, enforces SQL guards and stores no answer content', async () => {
  const draft = await questions.createDraft(content, 'test-editor');
  await questions.approve(
    draft.questionId,
    1,
    'test-reviewer',
    'Test-only review',
  );
  await questions.publish(draft.questionId, 1, 'test-publisher');
  await questions.retire(
    draft.questionId,
    1,
    'test-publisher',
    'Test-only retirement',
  );
  const archive = {
    ...finishedArchive(),
    matchId: 'm_retired_reference',
    questionSource: 'published',
    usedQuestionIds: [`${draft.questionId}_v1`],
  };
  await results.write(archive);
  const refs = await database.db.execute(
    sql`SELECT content_question_id, content_revision FROM game.result_questions WHERE match_id = ${archive.matchId}`,
  );
  expect(refs.rows).toEqual([
    { content_question_id: draft.questionId, content_revision: 1 },
  ]);
  expect(
    JSON.stringify((await results.get(archive.matchId))?.archive),
  ).not.toMatch(
    /correctChoiceId|private-answer|private-source|guest-name|token|accepted/,
  );
  for (const statement of [
    sql`UPDATE game.match_results SET payload_hash = repeat('b', 64) WHERE match_id = ${archive.matchId}`,
    sql`DELETE FROM game.match_results WHERE match_id = ${archive.matchId}`,
    sql`UPDATE game.result_questions SET position = 1 WHERE match_id = ${archive.matchId}`,
    sql`DELETE FROM game.result_questions WHERE match_id = ${archive.matchId}`,
  ])
    await expect(database.db.execute(statement)).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  await expect(
    database.db.execute(
      sql`INSERT INTO game.result_questions (match_id, position, question_id, content_question_id) VALUES (${archive.matchId}, 1, 'partial', ${draft.questionId})`,
    ),
  ).rejects.toMatchObject({ cause: { code: '23514' } });
});
it('denies result table access to a granted non-owner role without RLS policies', async () => {
  const reader = process.env.DATABASE_TEST_READER_ROLE!;
  await database.db.execute(
    sql`GRANT USAGE ON SCHEMA game TO ${sql.identifier(reader)}`,
  );
  await database.db.execute(
    sql`GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA game TO ${sql.identifier(reader)}`,
  );
  await database.db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(reader)}`);
    expect(
      (await tx.execute(sql`SELECT * FROM game.match_results`)).rows,
    ).toHaveLength(0);
    expect(
      (await tx.execute(sql`SELECT * FROM game.result_questions`)).rows,
    ).toHaveLength(0);
  });
  await expect(
    database.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(reader)}`);
      await tx.execute(
        sql`INSERT INTO game.match_results (match_id, payload_hash, archive) SELECT 'forbidden', payload_hash, jsonb_set(archive, '{matchId}', '"forbidden"') FROM game.match_results`,
      );
      // SELECT sees no rows; use an explicit known valid record to exercise INSERT.
      const archive = finishedArchive();
      await tx.execute(
        sql`INSERT INTO game.match_results (match_id, payload_hash, archive) VALUES ('m_forbidden', repeat('a', 64), ${JSON.stringify({ ...archive, matchId: 'm_forbidden' })}::jsonb)`,
      );
    }),
  ).rejects.toMatchObject({ cause: { code: '42501' } });
});
it('keeps pending visible until the commit, then broadcasts saved once for a real three-client match', async () => {
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const before = writes;
  const game = await group();
  expect(game.views[0]!.get().resultStorage).toBe('idle');
  for (let index = 0; index < 3; index++) game.send(index, 'READY');
  const start = await game.views[0]!.wait(
    (value) => value.state?.phase === 'ATTACK_SELECTION',
  );
  const actor = game.views.findIndex(
    (view) => view.get().playerId === start.state!.activePlayerId,
  );
  const active = await game.views[actor]!.wait(
    (value) => value.legalTargetIds.length > 0,
  );
  game.send(actor, 'SELECT_TARGET', { targetId: active.legalTargetIds[0]! });
  const duel = await game.views[0]!.wait(
    (value) => value.state?.phase === 'DUEL',
  );
  expect(JSON.stringify(duel)).not.toMatch(
    /correctChoiceId|archiveVersion|bankHash/,
  );
  game.send(actor, 'SUBMIT_ANSWER', {
    questionId: duel.state!.question!.id,
    choiceId: 'b',
  });
  await game.views[0]!.wait(
    (value) =>
      value.state?.phase === 'FINISHED' && value.resultStorage === 'pending',
  );
  expect(await results.get(game.matchId)).toBeNull();
  release!();
  gate = Promise.resolve();
  release = null;
  const saved = await Promise.all(
    game.views.map((view) =>
      view.wait((value) => value.resultStorage === 'saved'),
    ),
  );
  const record = (await results.get(game.matchId))!.archive;
  expect(record.result).toEqual(saved[0]!.state!.result);
  expect(record.territories).toEqual(
    saved[0]!.state!.territories.map(({ id, ownerId }) => ({ id, ownerId })),
  );
  expect(record.usedQuestionIds).toEqual([`${publishedId}_v1`]);
  expect(record.mode).toBe('private');
  expect(matchArchiveSchema.safeParse(record).success).toBe(true);
  expect(JSON.stringify(record)).not.toMatch(
    /guest-name|correctChoiceId|private-answer|private-source|token|accepted/,
  );
  await Promise.all(game.rooms.map((room) => room.leave()));
  expect(writes).toBe(before + 1);
}, 20000);
it('retries an uncertain commit without duplicating a durable result', async () => {
  const archive = { ...finishedArchive(), matchId: 'm_uncertain_commit' };
  let attempts = 0;
  const retry = createResultWriter(
    async (value) => {
      await results.write(value);
      if (++attempts === 1) throw new Error('Lost response after commit');
    },
    async () => {},
  );
  expect(await retry.submit(archive)).toBe('saved');
  expect(attempts).toBe(2);
  expect((await results.get(archive.matchId))?.archive).toEqual(archive);
  await retry.drain();
});
it('reports failed storage without changing a queued match winner or claiming durability', async () => {
  fail = true;
  try {
    const game = await group('kingdom_queue');
    for (let index = 0; index < 3; index++) game.send(index, 'READY');
    await game.views[0]!.wait(
      (value) => value.state?.phase === 'ATTACK_SELECTION',
    );
    await game.rooms[1]!.leave();
    await game.rooms[2]!.leave();
    const failed = await game.views[0]!.wait(
      (value) => value.resultStorage === 'failed',
    );
    expect(failed.state!.result).toMatchObject({
      reason: 'LAST_PLAYER',
      winners: ['p_teal'],
    });
    expect(await results.get(game.matchId)).toBeNull();
    expect(JSON.stringify(failed)).not.toContain('private DB failure');
    await game.rooms[0]!.leave();
  } finally {
    fail = false;
  }
});
it('persists prepared-match shutdown aborts while draining the service writer', async () => {
  const game = await group();
  for (const room of game.rooms) room.reconnection.enabled = false;
  stopped = true;
  await service.gracefullyShutdown(false);
  await writer.drain();
  expect((await results.get(game.matchId))?.archive.result).toMatchObject({
    reason: 'ABORTED',
    winners: [],
  });
});
it('boots and drains the actual standalone results-enabled entrypoint without editorial Auth', async () => {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url!,
      MATCH_RESULTS_ENABLED: 'true',
      CONTENT_ADMIN_ENABLED: 'false',
      GAME_QUESTION_SOURCE: 'development',
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      GAME_SERVER_HOST: '127.0.0.1',
      GAME_SERVER_PORT: '49004',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  );
  const guests: Room[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Standalone startup timeout')),
        10000,
      );
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes('"event":"service_started"')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once('error', () => {
        clearTimeout(timeout);
        reject(new Error('Standalone startup failed'));
      });
      child.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error('Standalone exited before startup'));
      });
    });
    expect(
      await (await fetch('http://127.0.0.1:49004/health')).json(),
    ).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      matchResultsEnabled: true,
      contentAdminEnabled: false,
      questionSource: 'development',
    });
    const sdk = new Client('http://127.0.0.1:49004');
    guests.push(await sdk.create('kingdom', { name: 'اختبار الحفظ' }));
    const view = observe(guests[0]!);
    for (let index = 0; index < 2; index++)
      guests.push(
        await sdk.joinById(guests[0]!.roomId, { name: 'اختبار الحفظ' }),
      );
    for (const guest of guests) guest.reconnection.enabled = false;
    const prepared = await view.wait((value) => value.state?.phase === 'LOBBY');
    expect(prepared.resultStorage).toBe('idle');
    child.kill('SIGTERM');
    expect(await exited).toBe(0);
    expect(
      (await results.get(prepared.state!.matchId))?.archive.result,
    ).toMatchObject({
      reason: 'ABORTED',
      winners: [],
    });
  } finally {
    child.kill('SIGTERM');
    await Promise.all(guests.map((guest) => guest.leave().catch(() => {})));
    await exited;
  }
}, 20000);
