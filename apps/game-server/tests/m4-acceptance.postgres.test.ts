import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { sql } from 'drizzle-orm';
import {
  createMatchResultRepository,
  createQuestionRepository,
  migrateDatabase,
  openDatabase,
} from '@mamalik/database';
import { DEFAULT_RULES } from '@mamalik/game-core';
import {
  PROTOCOL_VERSION,
  eventSchema,
  matchHistoryPageSchema,
  personalStandingSchema,
  roomSnapshotSchema,
} from '@mamalik/shared';
import type { RoomSnapshot, ServerEvent } from '@mamalik/shared';
import { createGameService } from '../src/server.js';
import { createContentAuthenticator } from '../src/content-auth.js';
import { createPlayerAccess } from '../src/player-access.js';
import { createPlayerHistory } from '../src/player-history.js';
import { createPlayerStanding } from '../src/player-standing.js';
import { createResultWriter } from '../src/result-writer.js';
import { publishedQuestionLoader } from '../src/question-bank.js';
import { startAuthFixture } from './support/auth-server.js';

const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:m4 to create an isolated database');
const database = openDatabase(url);
const questions = createQuestionRepository(database.db);
const results = createMatchResultRepository(database.db);
const subjects = Array.from({ length: 4 }, () => randomUUID());
const playerIds = ['p_teal', 'p_blue', 'p_gold'] as const;
const secrets: string[] = [...subjects];
const clients = new Set<Room>();
let auth: Awaited<ReturnType<typeof startAuthFixture>>;
let service: ReturnType<typeof createGameService>;
let endpoint = '',
  stopped = false,
  reads = 0,
  unavailable = false,
  writes = 0;
let releaseCommit = () => {};
const commitGate = new Promise<void>((resolve) => {
  releaseCommit = resolve;
});
const writer = createResultWriter(async (archive, participants) => {
  writes++;
  await commitGate;
  return results.write(archive, participants);
});

beforeAll(async () => {
  await migrateDatabase(database.db);
  auth = await startAuthFixture();
  secrets.push(auth.issuer);
  service = createGameService(
    {
      seed: 2026,
      // No rules, timing, resolution, rate-limit or reconnect overrides.
      loadQuestions: publishedQuestionLoader(async () => {
        reads++;
        if (unavailable) throw new Error('acceptance-private-query-error');
        return questions.loadPublished(1001);
      }),
      resultWriter: writer,
      playerAccess: createPlayerAccess(
        createContentAuthenticator(auth.url, auth.key),
      ),
    },
    undefined,
    createPlayerHistory(database.db),
    createPlayerStanding(database.db),
  );
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server!.address();
  if (!address || typeof address === 'string')
    throw new Error('No acceptance address');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  releaseCommit();
  await Promise.all(
    [...clients].map((client) => client.leave().catch(() => {})),
  );
  if (!stopped) await service?.gracefullyShutdown(false);
  await writer.drain();
  await auth?.close();
  await database.close();
});

// Deliberately synthetic public fixtures. Never load/approve the private draft pack.
const fixtureContent = (index: number, answer = 'b') => ({
  locale: 'ar',
  category: 'اختبار قبول آلي',
  text: `سؤال اصطناعي لاختبار الربط رقم ${index}؟`,
  choices: [
    { id: 'a', text: 'الخيار الأول' },
    { id: 'b', text: 'الخيار الثاني' },
    { id: 'c', text: 'الخيار الثالث' },
    { id: 'd', text: 'الخيار الرابع' },
  ],
  correctChoiceId: answer,
  explanation: `acceptance-private-explanation-${index}`,
  sources: [
    {
      label: 'acceptance-private-source',
      url: 'https://example.org/acceptance-only',
    },
  ],
});
async function publish(id: string, revision: number) {
  await questions.approve(
    id,
    revision,
    'test-fixture-reviewer',
    'Synthetic acceptance fixture only; not human review or release approval.',
  );
  await questions.publish(id, revision, 'test-fixture-publisher');
}
function assertNoIdentity(input: unknown) {
  const serialized = JSON.stringify(input);
  for (const secret of secrets) expect(serialized).not.toContain(secret);
  expect(serialized).not.toMatch(
    /access_token|refresh_token|reconnectionToken/,
  );
}

function observe(room: Room) {
  clients.add(room);
  let current: RoomSnapshot | null = null;
  let failure: unknown = null;
  const events: ServerEvent[] = [];
  const listeners = new Set<() => void>();
  const receive = (work: () => void) => {
    try {
      work();
    } catch (error) {
      failure = error;
    }
    for (const listener of listeners) listener();
  };
  room.onMessage('snapshot', (input: unknown) =>
    receive(() => {
      const value = roomSnapshotSchema.parse(input);
      assertNoIdentity(value);
      if (value.state?.phase === 'DUEL') {
        expect(JSON.stringify(value)).not.toMatch(
          /correctChoiceId|acceptance-private|questionDeck|bankHash/,
        );
        expect(value.reveal).toBeNull();
      }
      current = value;
    }),
  );
  room.onMessage('event', (input: unknown) =>
    receive(() => {
      assertNoIdentity(input);
      events.push(eventSchema.parse(input));
    }),
  );
  room.onMessage('clock', () => {});
  function wait<T>(read: () => T | null): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(inspect);
        reject(new Error('M4 acceptance observation timed out'));
      }, 10000);
      function inspect() {
        if (failure) {
          clearTimeout(timer);
          listeners.delete(inspect);
          reject(failure);
          return;
        }
        const value = read();
        if (value !== null) {
          clearTimeout(timer);
          listeners.delete(inspect);
          resolve(value);
        }
      }
      listeners.add(inspect);
      inspect();
    });
  }
  room.send('sync', { nonce: 'acceptance_initial' });
  return {
    room,
    get: () => current!,
    wait: (check: (value: RoomSnapshot) => boolean) =>
      wait(() => (current && check(current) ? current : null)),
    event: (key: string, type: ServerEvent['type']) =>
      wait(
        () =>
          events.find(
            (event) =>
              event.type === type &&
              'idempotencyKey' in event &&
              event.idempotencyKey === key,
          ) ?? null,
      ),
    assertClean: () => {
      if (failure) throw failure;
    },
  };
}
type View = ReturnType<typeof observe>;
function send(
  view: View,
  type: string,
  fields: Record<string, string> = {},
  key = `${type}_${view.get().state!.turn}`,
) {
  const state = view.get().state!;
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    matchId: state.matchId,
    turn: state.turn,
    idempotencyKey: key,
    type,
    ...fields,
  };
  view.room.send('command', command);
  return command;
}
async function accountRead(base: string, token: string, path: string) {
  const response = await fetch(`${base}/player/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const value: unknown = await response.json();
  assertNoIdentity(value);
  expect(JSON.stringify(value)).not.toMatch(
    /correctChoiceId|acceptance-private|bankHash|usedQuestionIds/,
  );
  return value;
}

function standalone(port: string) {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url!,
      CONTENT_ADMIN_ENABLED: 'false',
      PLAYER_AUTH_ENABLED: 'true',
      MATCH_RESULTS_ENABLED: 'true',
      GAME_QUESTION_SOURCE: 'published',
      SUPABASE_URL: auth.url,
      SUPABASE_PUBLISHABLE_KEY: auth.key,
      GAME_SERVER_HOST: '127.0.0.1',
      GAME_SERVER_PORT: port,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-16384);
  });
  // Drain stderr without reflecting potential diagnostics into test output.
  child.stderr.resume();
  let ended = false;
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => {
      ended = true;
      resolve(code);
    });
    child.once('error', () => {
      ended = true;
      resolve(null);
    });
  });
  const ready = new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      child.stdout.off('data', inspect);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('Standalone acceptance startup timed out')),
      10000,
    );
    function inspect() {
      if (log.includes('"event":"service_started"')) finish();
    }
    child.stdout.on('data', inspect);
    child.once('error', () =>
      finish(new Error('Standalone acceptance startup failed')),
    );
    child.once('exit', () =>
      finish(new Error('Standalone acceptance service exited')),
    );
  });
  return {
    ready,
    async stop() {
      if (!ended) child.kill('SIGTERM');
      const guard = setTimeout(() => {
        if (!ended) child.kill('SIGKILL');
      }, 5000);
      try {
        return await exited;
      } finally {
        clearTimeout(guard);
      }
    },
  };
}

it('completes standard account matchmaking, commits exact pinned revisions once, and preserves private history/standing across a process restart', async () => {
  const sdk = new Client(endpoint);
  const tokens = await Promise.all(
    subjects.map((subject) => auth.token(subject)),
  );
  secrets.push(...tokens);
  const initial = {
    policyVersion: 'basic-v1',
    points: 0,
    position: null,
    eligibleMatches: 0,
    soleWins: 0,
    sharedWins: 0,
  };
  for (const token of tokens) {
    expect(await accountRead(endpoint, token, 'history')).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await accountRead(endpoint, token, 'standing')).toEqual(initial);
  }
  // Admission fails at 35; the actual normal-rules minimum is 36.
  const ids: string[] = [];
  for (let index = 0; index < DEFAULT_RULES.maxTurns; index++) {
    const draft = await questions.createDraft(
      fixtureContent(index),
      'test-fixture-author',
    );
    ids.push(draft.questionId);
    if (index < 35) await publish(draft.questionId, 1);
  }
  await expect(
    sdk.joinOrCreate('kingdom_queue', { name: 'اختبار القبول' }),
  ).rejects.toMatchObject({ code: 503, message: 'CONTENT_BANK_INSUFFICIENT' });
  await publish(ids[35]!, 1);
  const views: View[] = [];
  for (let index = 0; index < 3; index++) {
    const response = await fetch(`${endpoint}/player/ticket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens[index]!}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(200);
    const credential = (await response.json()) as { ticket: string };
    secrets.push(credential.ticket);
    views.push(
      observe(
        await new Client(endpoint).joinOrCreate('kingdom_queue', {
          name: `لاعب القبول ${index + 1}`,
          ticket: credential.ticket,
        }),
      ),
    );
  }
  expect(new Set(views.map((view) => view.room.roomId)).size).toBe(1);
  const prepared = await Promise.all(
    views.map((view) => view.wait((value) => value.state?.phase === 'LOBBY')),
  );
  const matchId = prepared[0]!.state!.matchId;
  expect(prepared.map((value) => value.playerId)).toEqual(playerIds);
  for (const value of prepared)
    expect(value.rules).toEqual({
      maxTurns: 36,
      selectionMs: 10000,
      answerMs: 15000,
    });
  // The admitted room retains v1, even after a new answer is published.
  await questions.revise(
    ids[0]!,
    1,
    fixtureContent(0, 'c'),
    'test-fixture-author',
  );
  await publish(ids[0]!, 2);
  unavailable = true;
  await expect(
    sdk.create('kingdom', { name: 'اختبار الانقطاع' }),
  ).rejects.toMatchObject({ code: 503, message: 'CONTENT_BANK_UNAVAILABLE' });
  const pinnedReadCount = reads;
  for (const view of views) send(view, 'READY');
  const used: string[] = [];
  let tealCaptured = false;
  for (let turn = 1; turn <= DEFAULT_RULES.maxTurns; turn++) {
    const starts = await Promise.all(
      views.map((view) =>
        view.wait(
          (value) =>
            value.state?.phase === 'ATTACK_SELECTION' &&
            value.state.turn === turn,
        ),
      ),
    );
    const actor = views.findIndex(
      (view) => view.get().playerId === starts[0]!.state!.activePlayerId,
    );
    let attacker = views[actor]!;
    const selection = attacker.get();
    const target = selection.legalTargetIds.find(
      (id) =>
        selection.state!.territories.find((node) => node.id === id)?.ownerId ===
        null,
    );
    expect(target).toBeDefined();
    if (turn === 1) {
      const before = selection.state;
      send(
        attacker,
        'SELECT_TARGET',
        { targetId: target!, actor: 'p_injected' },
        'injected_actor',
      );
      expect(
        await attacker.event('injected_actor', 'COMMAND_REJECTED'),
      ).toMatchObject({ error: 'MALFORMED_COMMAND' });
      const ownCastle = before!.territories.find(
        (node) => node.castle && node.ownerId === selection.playerId,
      )!.id;
      send(
        attacker,
        'SELECT_TARGET',
        { targetId: ownCastle },
        'illegal_target',
      );
      expect(
        await attacker.event('illegal_target', 'COMMAND_REJECTED'),
      ).toMatchObject({ error: 'ILLEGAL_TARGET' });
      expect(attacker.get().state).toEqual(before);
    }
    const intent = send(attacker, 'SELECT_TARGET', { targetId: target! });
    if (turn === 1) attacker.room.send('command', intent);
    const duels = await Promise.all(
      views.map((view) =>
        view.wait(
          (value) => value.state?.phase === 'DUEL' && value.state.turn === turn,
        ),
      ),
    );
    const question = duels[0]!.state!.question!;
    expect(question.defenderId).toBeNull();
    expect(ids.map((id) => `${id}_v1`)).toContain(question.id);
    used.push(question.id);
    if (turn === 1) {
      const observer = views[(actor + 1) % 3]!;
      send(
        observer,
        'SUBMIT_ANSWER',
        { questionId: question.id, choiceId: 'b' },
        'observer_answer',
      );
      expect(
        await observer.event('observer_answer', 'COMMAND_REJECTED'),
      ).toMatchObject({ error: 'INVALID_ACTOR' });
      send(
        attacker,
        'SUBMIT_ANSWER',
        { questionId: question.id, choiceId: 'unknown' },
        'invalid_choice',
      );
      expect(
        await attacker.event('invalid_choice', 'COMMAND_REJECTED'),
      ).toMatchObject({ error: 'INVALID_ANSWER' });
    }
    if (turn === 12) {
      const recovery = attacker.room.reconnectionToken;
      attacker.room.reconnection.enabled = false;
      attacker.room.connection.close(4010);
      attacker = observe(await sdk.reconnect(recovery));
      views[actor] = attacker;
      const restored = await attacker.wait(
        (value) => value.state?.phase === 'DUEL' && value.state.turn === turn,
      );
      expect(restored.playerId).toBe(duels[actor]!.playerId);
      expect(restored.state!.question!.deadline).toBe(question.deadline);
      expect(restored.ownChoiceId).toBeNull();
    }
    const capture = attacker.get().playerId === 'p_teal' && !tealCaptured;
    const answer = send(attacker, 'SUBMIT_ANSWER', {
      questionId: question.id,
      choiceId: capture ? 'b' : 'a',
    });
    if (turn === 1) attacker.room.send('command', answer);
    const resolutions = await Promise.all(
      views.map((view) =>
        view.wait(
          (value) =>
            value.state?.phase === 'RESOLUTION' && value.state.turn === turn,
        ),
      ),
    );
    for (const value of resolutions) {
      expect(value.state!.outcome).toMatchObject({
        captured: capture,
        correctChoiceId: 'b',
      });
      expect(value.reveal?.explanation).toContain(
        'acceptance-private-explanation',
      );
    }
    if (capture) tealCaptured = true;
    expect(reads).toBe(pinnedReadCount);
    if (turn % 12 === 0)
      console.info(
        JSON.stringify({ event: 'm4_acceptance_progress', turns: turn }),
      );
  }
  const pending = await Promise.all(
    views.map((view) =>
      view.wait(
        (value) =>
          value.state?.phase === 'FINISHED' &&
          value.resultStorage === 'pending',
      ),
    ),
  );
  expect(new Set(used).size).toBe(36);
  expect(new Set(used)).toEqual(new Set(ids.map((id) => `${id}_v1`)));
  expect(pending[0]!.state!.result).toMatchObject({
    reason: 'TURN_LIMIT',
    winners: ['p_teal'],
  });
  expect(await results.get(matchId)).toBeNull();
  expect(await accountRead(endpoint, tokens[0]!, 'history')).toEqual({
    items: [],
    nextCursor: null,
  });
  expect(await accountRead(endpoint, tokens[0]!, 'standing')).toEqual(initial);
  releaseCommit();
  const saved = await Promise.all(
    views.map((view) => view.wait((value) => value.resultStorage === 'saved')),
  );
  for (const value of saved)
    expect(value.state!.result).toEqual(pending[0]!.state!.result);
  const archive = (await results.get(matchId))!.archive;
  expect(archive).toMatchObject({
    mode: 'matchmaking',
    questionSource: 'published',
    finalTurn: 36,
    rules: DEFAULT_RULES,
    usedQuestionIds: used,
    result: saved[0]!.state!.result,
  });
  assertNoIdentity(archive);
  expect(JSON.stringify(archive)).not.toMatch(
    /لاعب القبول|correctChoiceId|acceptance-private/,
  );
  const roster = playerIds.map((playerId, index) => ({
    playerId,
    issuer: auth.issuer,
    subject: subjects[index]!,
  }));
  await Promise.all(
    Array.from({ length: 3 }, () =>
      results
        .write(archive, roster)
        .then((value) => expect(value.created).toBe(false)),
    ),
  );
  const counts = await database.db.execute<{
    results: number;
    questions: number;
    participants: number;
  }>(
    sql`SELECT (SELECT count(*)::int FROM game.match_results) AS results, (SELECT count(*)::int FROM game.result_questions) AS questions, (SELECT count(*)::int FROM game.result_participants) AS participants`,
  );
  expect(counts.rows[0]).toEqual({
    results: 1,
    questions: 36,
    participants: 3,
  });
  const bindings = await database.db.execute(
    sql`SELECT player_id, issuer, subject FROM game.result_participants WHERE match_id = ${matchId} ORDER BY player_id`,
  );
  expect(bindings.rows).toEqual(
    [...roster]
      .sort((a, b) => a.playerId.localeCompare(b.playerId))
      .map(({ playerId, ...identity }) => ({
        player_id: playerId,
        ...identity,
      })),
  );
  const pages: unknown[] = [],
    standings: unknown[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const page = matchHistoryPageSchema.parse(
      await accountRead(endpoint, tokens[index]!, 'history'),
    );
    const standing = personalStandingSchema.parse(
      await accountRead(endpoint, tokens[index]!, 'standing'),
    );
    if (index < 3) {
      expect(page.items).toHaveLength(1);
      const own = archive.result.placements.find(
        (row) => row.playerId === playerIds[index],
      )!;
      expect(page.items[0]).toMatchObject({
        matchId,
        mode: 'matchmaking',
        finalTurn: 36,
        reason: 'TURN_LIMIT',
        outcome: index === 0 ? 'won' : 'lost',
        rank: own.rank,
        score: own.score,
        castles: own.castles,
        territories: own.territories,
        eliminated: false,
      });
      expect(standing).toEqual({
        policyVersion: 'basic-v1',
        points: index === 0 ? 3 : 0,
        position: index === 0 ? 1 : 2,
        eligibleMatches: 1,
        soleWins: index === 0 ? 1 : 0,
        sharedWins: 0,
      });
    } else {
      expect(page.items).toHaveLength(0);
      expect(standing).toEqual(initial);
    }
    pages.push(page);
    standings.push(standing);
  }
  expect(writes).toBe(1);
  for (const view of views) view.assertClean();
  await Promise.all(views.map((view) => view.room.leave()));
  await service.gracefullyShutdown(false);
  stopped = true;
  await writer.drain();
  const restarted = standalone(new URL(endpoint).port);
  try {
    await restarted.ready;
    expect(await (await fetch(`${endpoint}/health`)).json()).toMatchObject({
      questionSource: 'published',
      matchResultsEnabled: true,
      contentAdminEnabled: false,
    });
    for (let index = 0; index < tokens.length; index++) {
      expect(await accountRead(endpoint, tokens[index]!, 'history')).toEqual(
        pages[index],
      );
      expect(await accountRead(endpoint, tokens[index]!, 'standing')).toEqual(
        standings[index],
      );
    }
    auth.revoked.add(subjects[0]!);
    for (const path of ['history', 'standing']) {
      const denied = await fetch(`${endpoint}/player/${path}`, {
        headers: { Authorization: `Bearer ${tokens[0]!}` },
      });
      expect(denied.status).toBe(401);
      expect(await denied.json()).toEqual({ error: 'UNAUTHENTICATED' });
    }
  } finally {
    expect(await restarted.stop()).toBe(0);
  }
}, 180000);
