import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { sql } from 'drizzle-orm';
import {
  createMatchResultRepository,
  migrateDatabase,
  openDatabase,
} from '@mamalik/database';
import { PROTOCOL_VERSION, roomSnapshotSchema } from '@mamalik/shared';
import type { RoomSnapshot } from '@mamalik/shared';
import { createGameService } from '../src/server.js';
import { createPlayerAccess } from '../src/player-access.js';
import { createContentAuthenticator } from '../src/content-auth.js';
import { createResultWriter } from '../src/result-writer.js';
import { startAuthFixture } from './support/auth-server.js';
import { finishedArchive } from './support/result-fixture.js';
const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:players');
const database = openDatabase(url);
const repository = createMatchResultRepository(database.db);
const writer = createResultWriter(repository.write);
let auth: Awaited<ReturnType<typeof startAuthFixture>>;
let service: ReturnType<typeof createGameService>;
let endpoint = '';
const subject = randomUUID();
const other = randomUUID();
const clients: Room[] = [];
beforeAll(async () => {
  await migrateDatabase(database.db);
  await migrateDatabase(database.db);
  auth = await startAuthFixture();
  service = createGameService({
    playerAccess: createPlayerAccess(
      createContentAuthenticator(auth.url, auth.key),
    ),
    resultWriter: writer,
    rules: { maxTurns: 1 },
    reconnectSeconds: 2,
  });
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server!.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await Promise.all(clients.map((client) => client.leave().catch(() => {})));
  await service?.gracefullyShutdown(false);
  await writer.drain();
  await auth?.close();
  await database.close();
});
async function issue(user = subject) {
  const response = await fetch(`${endpoint}/player/ticket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await auth.token(user)}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { ticket: string }).ticket;
}
function watch(room: Room) {
  let current: RoomSnapshot | null = null;
  const listeners = new Set<() => void>();
  room.onMessage('snapshot', (input: unknown) => {
    current = roomSnapshotSchema.parse(input);
    for (const listener of listeners) listener();
  });
  room.onMessage('clock', () => {});
  room.onMessage('event', () => {});
  return (check: (value: RoomSnapshot) => boolean) =>
    new Promise<RoomSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(inspect);
        reject(new Error('Snapshot timeout'));
      }, 10000);
      function inspect() {
        if (current && check(current)) {
          clearTimeout(timer);
          listeners.delete(inspect);
          resolve(current);
        }
      }
      listeners.add(inspect);
      inspect();
      room.send('sync', { nonce: 'account_test' });
    });
}
it('verifies identity from the header only, rejects malformed/forged credentials and browser origins', async () => {
  for (const [header, body, origin, status] of [
    ['', '{}', '', 401],
    ['Bearer a.b.c', '{}', '', 401],
    [
      `Bearer ${await auth.token(subject)}`,
      JSON.stringify({ subject }),
      '',
      400,
    ],
    [
      `Bearer ${await auth.token(subject)}`,
      '{}',
      'https://untrusted.example',
      403,
    ],
  ] as const) {
    const response = await fetch(`${endpoint}/player/ticket`, {
      method: 'POST',
      headers: {
        Authorization: header,
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
      },
      body,
    });
    expect(response.status).toBe(status);
    expect(await response.text()).not.toMatch(
      /access_token|refresh_token|stack|subject/,
    );
  }
  const token = await auth.token(subject);
  auth.revoked.add(subject);
  try {
    expect(
      (
        await fetch(`${endpoint}/player/ticket`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
      ).status,
    ).toBe(401);
  } finally {
    auth.revoked.delete(subject);
  }
});
it('binds one account per room, rejects consumed tickets and identity injection, and releases an unprepared seat', async () => {
  const sdk = new Client(endpoint);
  const ticket = await issue();
  const first = await sdk.create('kingdom', { name: 'Account canary', ticket });
  clients.push(first);
  const wait = watch(first);
  await wait((value) => value.seats.length === 1);
  await expect(
    sdk.joinById(first.roomId, { name: 'Replay', ticket }),
  ).rejects.toMatchObject({ code: 401 });
  const attempts = await Promise.allSettled(
    Array.from({ length: 2 }, async () =>
      sdk.joinById(first.roomId, { name: 'Duplicate', ticket: await issue() }),
    ),
  );
  expect(attempts.every((value) => value.status === 'rejected')).toBe(true);
  for (const attempt of attempts)
    if (attempt.status === 'rejected')
      expect(attempt.reason).toMatchObject({
        code: 409,
        message: 'PLAYER_ALREADY_SEATED',
      });
  await expect(
    sdk.joinById(first.roomId, { name: 'Injected', subject: other }),
  ).rejects.toBeDefined();
  const guest = await sdk.joinById(first.roomId, { name: 'Guest canary' });
  clients.push(guest);
  await first.leave();
  const replacement = await sdk.joinById(guest.roomId, {
    name: 'Replacement',
    ticket: await issue(),
  });
  clients.push(replacement);
  const snapshot = await watch(replacement)(
    (value) => value.seats.length === 2,
  );
  expect(snapshot.playerId).toBe('p_teal');
  expect(JSON.stringify(snapshot)).not.toMatch(
    new RegExp(`${subject}|${other}|issuer|ticket|access_token`),
  );
  await replacement.leave();
  await guest.leave();
});
it('retains a verified binding through bearer reconnect and persists mixed-room participants privately', async () => {
  const sdk = new Client(endpoint);
  const first = await sdk.create('kingdom_queue', {
    name: 'Account canary',
    ticket: await issue(),
  });
  clients.push(first);
  const second = await sdk.joinById(first.roomId, {
    name: 'Other account canary',
    ticket: await issue(other),
  });
  clients.push(second);
  const guest = await sdk.joinById(first.roomId, { name: 'Guest canary' });
  clients.push(guest);
  await watch(first)((value) => value.state?.phase === 'LOBBY');
  const recovery = first.reconnectionToken;
  first.reconnection.enabled = false;
  first.connection.close(4010);
  const restored = await sdk.reconnect(recovery);
  clients.push(restored);
  const wait = watch(restored);
  const state = await wait((value) => value.state?.phase === 'LOBBY');
  expect(state.playerId).toBe('p_teal');
  expect(JSON.stringify(state)).not.toMatch(
    new RegExp(`${subject}|${other}|issuer|ticket`),
  );
  for (const room of [restored, second, guest])
    room.send('command', {
      protocolVersion: PROTOCOL_VERSION,
      type: 'READY',
      matchId: state.state!.matchId,
      turn: 0,
      idempotencyKey: 'ready',
    });
  await wait((value) => value.state?.phase === 'ATTACK_SELECTION');
  await second.leave();
  await guest.leave();
  const saved = await wait((value) => value.resultStorage === 'saved');
  expect(saved.state!.result?.winners).toEqual(['p_teal']);
  const rows = await database.db.execute(
    sql`SELECT player_id, issuer, subject FROM game.result_participants WHERE match_id = ${saved.state!.matchId} ORDER BY player_id`,
  );
  expect(rows.rows).toEqual([
    { player_id: 'p_blue', issuer: auth.issuer, subject: other },
    { player_id: 'p_teal', issuer: auth.issuer, subject },
  ]);
  const archive = await repository.get(saved.state!.matchId);
  expect(JSON.stringify(archive)).not.toMatch(
    new RegExp(`${subject}|${other}|issuer|Account canary|Guest canary`),
  );
  await restored.leave();
});
it('atomically deduplicates account mappings and refuses identity reassignment after commit', async () => {
  const archive = { ...finishedArchive(), matchId: 'm_private_bindings' };
  const bindings = [
    { playerId: 'p_teal', issuer: auth.issuer, subject },
    { playerId: 'p_blue', issuer: auth.issuer, subject: other },
  ];
  const writes = await Promise.all(
    Array.from({ length: 4 }, () => repository.write(archive, bindings)),
  );
  expect(writes.filter((value) => value.created)).toHaveLength(1);
  expect(await repository.write(archive, [...bindings].reverse())).toEqual({
    created: false,
  });
  await expect(
    repository.write(archive, [{ ...bindings[0]!, subject: randomUUID() }]),
  ).rejects.toMatchObject({ message: 'MATCH_ARCHIVE_CONFLICT' });
  const invalid = {
    ...archive,
    matchId: 'm_rollback_bindings',
    questionSource: 'published',
    usedQuestionIds: [`${randomUUID()}_v1`],
  };
  await expect(repository.write(invalid, bindings)).rejects.toBeDefined();
  expect(await repository.get(invalid.matchId)).toBeNull();
  expect(
    (
      await database.db.execute(
        sql`SELECT * FROM game.result_participants WHERE match_id = ${invalid.matchId}`,
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    database.db.execute(
      sql`UPDATE game.result_participants SET subject = ${randomUUID()} WHERE match_id = ${archive.matchId}`,
    ),
  ).rejects.toMatchObject({ cause: { code: '23514' } });
  await expect(
    database.db.execute(
      sql`DELETE FROM game.result_participants WHERE match_id = ${archive.matchId}`,
    ),
  ).rejects.toMatchObject({ cause: { code: '23514' } });
  const reader = process.env.DATABASE_TEST_READER_ROLE!;
  await database.db.execute(
    sql`GRANT USAGE ON SCHEMA game TO ${sql.identifier(reader)}`,
  );
  await database.db.execute(
    sql`GRANT SELECT ON game.result_participants TO ${sql.identifier(reader)}`,
  );
  await database.db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(reader)}`);
    expect(
      (await tx.execute(sql`SELECT * FROM game.result_participants`)).rows,
    ).toHaveLength(0);
  });
});
it('starts the standalone account-enabled service and commits its private binding during shutdown', async () => {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url!,
      MATCH_RESULTS_ENABLED: 'true',
      PLAYER_AUTH_ENABLED: 'true',
      CONTENT_ADMIN_ENABLED: 'false',
      GAME_QUESTION_SOURCE: 'development',
      SUPABASE_URL: auth.url,
      SUPABASE_PUBLISHABLE_KEY: auth.key,
      GAME_SERVER_HOST: '127.0.0.1',
      GAME_SERVER_PORT: '49005',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', resolve),
  );
  const guests: Room[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Standalone startup timeout')),
        10000,
      );
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes('"event":"service_started"')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Standalone startup failed'));
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Standalone exited'));
      });
    });
    const response = await fetch('http://127.0.0.1:49005/player/ticket', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await auth.token(subject)}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(200);
    const credential = (await response.json()) as { ticket: string };
    expect((await fetch('http://127.0.0.1:49005/admin/questions')).status).toBe(
      404,
    );
    const sdk = new Client('http://127.0.0.1:49005');
    guests.push(
      await sdk.create('kingdom', {
        name: 'Standalone',
        ticket: credential.ticket,
      }),
    );
    const wait = watch(guests[0]!);
    for (let index = 0; index < 2; index++)
      guests.push(await sdk.joinById(guests[0]!.roomId, { name: 'Guest' }));
    for (const guest of guests) guest.reconnection.enabled = false;
    const prepared = await wait((value) => value.state?.phase === 'LOBBY');
    const history = await fetch('http://127.0.0.1:49005/player/history', {
      headers: { Authorization: `Bearer ${await auth.token(subject)}` },
    });
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({ items: expect.any(Array) });
    child.kill('SIGTERM');
    expect(await exited).toBe(0);
    expect(
      (await repository.get(prepared.state!.matchId))?.archive.result.reason,
    ).toBe('ABORTED');
    expect(
      (
        await database.db.execute(
          sql`SELECT subject FROM game.result_participants WHERE match_id = ${prepared.state!.matchId}`,
        )
      ).rows,
    ).toEqual([{ subject }]);
  } finally {
    child.kill('SIGTERM');
    await Promise.all(guests.map((guest) => guest.leave().catch(() => {})));
    await exited;
  }
}, 20000);
