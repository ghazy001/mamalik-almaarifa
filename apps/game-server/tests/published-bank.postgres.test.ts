import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import {
  createQuestionRepository,
  migrateDatabase,
  openDatabase,
} from '@mamalik/database';
import { PROTOCOL_VERSION, roomSnapshotSchema } from '@mamalik/shared';
import type { RoomSnapshot } from '@mamalik/shared';
import { createGameService } from '../src/server.js';
import {
  databaseQuestionLoader,
  publishedQuestionLoader,
} from '../src/question-bank.js';

const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:room-bank');
const database = openDatabase(url);
const repository = createQuestionRepository(database.db);
let reads = 0;
let failReads = false;
const service = createGameService({
  seed: 2026,
  rules: { maxTurns: 3, selectionMs: 5000, answerMs: 2000 },
  resolutionMs: 100,
  loadQuestions: publishedQuestionLoader(async () => {
    reads++;
    if (failReads) throw new Error('private-query-canary');
    return repository.loadPublished();
  }),
});
let endpoint = '';
const clients: Room[] = [];
beforeAll(async () => {
  await migrateDatabase(database.db);
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server?.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await Promise.all(clients.map((client) => client.leave().catch(() => {})));
  await service.gracefullyShutdown(false);
  await database.close();
});
const content = (suffix: string) => ({
  locale: 'ar',
  category: 'اختبار الربط الخاص',
  text: `سؤال اختبار خاص للخادم ${suffix}؟`,
  choices: [
    { id: 'a', text: 'أول' },
    { id: 'b', text: 'ثان' },
    { id: 'c', text: 'ثالث' },
    { id: 'd', text: 'رابع' },
  ],
  correctChoiceId: 'b',
  explanation: `private-explanation-${suffix}`,
  sources: [
    { label: `private-source-${suffix}`, url: 'https://example.org/fixture' },
  ],
});
function observe(room: Room) {
  let current: RoomSnapshot | null = null;
  const callbacks = new Set<() => void>();
  room.onMessage('snapshot', (raw: unknown) => {
    current = roomSnapshotSchema.parse(raw);
    for (const callback of callbacks) callback();
  });
  room.onMessage('event', () => {});
  room.onMessage('clock', () => {});
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
        room.send('sync', { nonce: 'bank_test' });
      });
    },
  };
}
it('rejects insufficient published banks in both room modes with safe admission codes', async () => {
  const draft = await repository.createDraft(
    content('draft'),
    'fixture-editor',
  );
  const approved = await repository.createDraft(
    content('approved'),
    'fixture-editor',
  );
  await repository.approve(
    approved.questionId,
    1,
    'fixture-reviewer',
    'Test only',
  );
  const retired = await repository.createDraft(
    content('retired'),
    'fixture-editor',
  );
  await repository.approve(
    retired.questionId,
    1,
    'fixture-reviewer',
    'Test only',
  );
  await repository.publish(retired.questionId, 1, 'fixture-publisher');
  await repository.retire(
    retired.questionId,
    1,
    'fixture-publisher',
    'Test only',
  );
  expect((await repository.getRevision(draft.questionId, 1)).status).toBe(
    'DRAFT',
  );
  for (const mode of ['kingdom', 'kingdom_queue'])
    await expect(
      new Client(endpoint).create(mode, { name: 'ضيف' }),
    ).rejects.toMatchObject({
      code: 503,
      message: 'CONTENT_BANK_INSUFFICIENT',
    });
  expect(await repository.loadPublished()).toEqual([]);
});
it('pins exact revisions before admission, survives publication/outage, and completes two three-client matches privately', async () => {
  const published: string[] = [];
  for (let index = 0; index < 3; index++) {
    const row = await repository.createDraft(
      content(String(index)),
      'fixture-editor',
    );
    await repository.approve(
      row.questionId,
      1,
      'fixture-reviewer',
      'Test-only review',
    );
    await repository.publish(row.questionId, 1, 'fixture-publisher');
    published.push(row.questionId);
  }
  const first = await new Client(endpoint).create('kingdom', { name: 'أ' });
  expect((await databaseQuestionLoader(database.db)(3)).ids).toHaveLength(3);
  expect(await repository.loadPublished(1)).toHaveLength(1);
  clients.push(first);
  // Revise/publish while this room still has only one seat. Existing bank stays v1.
  await repository.revise(
    published[0]!,
    1,
    content('updated'),
    'fixture-editor',
  );
  await repository.approve(
    published[0]!,
    2,
    'fixture-reviewer',
    'Test-only revision review',
  );
  await repository.publish(published[0]!, 2, 'fixture-publisher');
  await repository.retire(
    published[1]!,
    1,
    'fixture-publisher',
    'Test-only retirement',
  );
  await expect(
    new Client(endpoint).joinOrCreate('kingdom_queue', { name: 'ضيف' }),
  ).rejects.toMatchObject({
    code: 503,
    message: 'CONTENT_BANK_INSUFFICIENT',
  });
  await repository.revise(
    published[1]!,
    1,
    content('replacement'),
    'fixture-editor',
  );
  await repository.approve(
    published[1]!,
    2,
    'fixture-reviewer',
    'Test-only replacement review',
  );
  await repository.publish(published[1]!, 2, 'fixture-publisher');
  const secondRoom = await new Client(endpoint).joinOrCreate('kingdom_queue', {
    name: 'أ',
  });
  clients.push(secondRoom);
  failReads = true;
  await expect(
    new Client(endpoint).create('kingdom', { name: 'ضيف' }),
  ).rejects.toMatchObject({
    code: 503,
    message: 'CONTENT_BANK_UNAVAILABLE',
  });
  const before = reads;
  async function finish(firstClient: Room, expected: string[]) {
    const group = [firstClient];
    const views = [observe(firstClient)];
    for (const name of ['ب', 'ج']) {
      const joined = await new Client(endpoint).joinById(firstClient.roomId, {
        name,
      });
      clients.push(joined);
      group.push(joined);
      views.push(observe(joined));
    }
    await Promise.all(
      views.map((view) => view.wait((state) => state.state?.phase === 'LOBBY')),
    );
    const matchId = views[0]!.get().state!.matchId;
    function send(index: number, type: string, fields = {}) {
      const snapshot = views[index]!.get();
      group[index]!.send('command', {
        protocolVersion: PROTOCOL_VERSION,
        type,
        matchId,
        turn: snapshot.state!.turn,
        idempotencyKey: `${type}_${snapshot.state!.turn}`,
        ...fields,
      });
    }
    for (let index = 0; index < 3; index++) send(index, 'READY');
    const seen: string[] = [];
    for (let turn = 1; turn <= 3; turn++) {
      const start = await views[0]!.wait(
        (value) =>
          value.state?.phase === 'ATTACK_SELECTION' &&
          value.state.turn === turn,
      );
      const actor = views.findIndex(
        (view) => view.get().playerId === start.state!.activePlayerId,
      );
      const actorView = await views[actor]!.wait(
        (value) =>
          value.state?.turn === turn && value.legalTargetIds.length > 0,
      );
      const target = actorView.legalTargetIds.find(
        (id) =>
          actorView.state!.territories.find((node) => node.id === id)
            ?.ownerId === null,
      )!;
      send(actor, 'SELECT_TARGET', { targetId: target });
      const duel = await Promise.all(
        views.map((view) =>
          view.wait(
            (value) =>
              value.state?.phase === 'DUEL' && value.state.turn === turn,
          ),
        ),
      );
      const question = duel[0]!.state!.question!;
      seen.push(question.id);
      expect(expected).toContain(question.id);
      for (const value of duel) {
        expect(JSON.stringify(value)).not.toMatch(
          /correctChoiceId|private-explanation|private-source|questionDeck/,
        );
        expect(value.reveal).toBeNull();
      }
      send(actor, 'SUBMIT_ANSWER', { questionId: question.id, choiceId: 'b' });
      const resolution = await views[0]!.wait(
        (value) =>
          value.state?.phase === 'RESOLUTION' && value.state.turn === turn,
      );
      expect(resolution.state!.outcome?.correctChoiceId).toBe('b');
      expect(resolution.reveal?.explanation).toContain('private-explanation');
    }
    const finished = await Promise.all(
      views.map((view) =>
        view.wait((value) => value.state?.phase === 'FINISHED'),
      ),
    );
    expect(new Set(seen).size).toBe(3);
    expect(seen.sort()).toEqual(expected.sort());
    for (const value of finished)
      expect(value.state!.result).toEqual(finished[0]!.state!.result);
    expect(finished[0]!.state!.result?.reason).toBe('TURN_LIMIT');
  }
  await finish(
    first,
    published.map((id) => `${id}_v1`),
  );
  await finish(
    secondRoom,
    published.map((id, index) => `${id}_v${index < 2 ? 2 : 1}`),
  );
  expect(reads).toBe(before); // No DB reads during joins, turns, answers or resolution.
}, 30000);

it('boots the standalone published service without editorial Auth and keeps its API disabled', async () => {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: url!,
      CONTENT_ADMIN_ENABLED: 'false',
      GAME_QUESTION_SOURCE: 'published',
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
      GAME_SERVER_HOST: '127.0.0.1',
      GAME_SERVER_PORT: '49003',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const exited = new Promise<void>((resolve) =>
    child.once('exit', () => resolve()),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Startup timeout')),
        10000,
      );
      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        if (output.includes('"event":"service_started"')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Startup failed'));
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Startup exited'));
      });
    });
    const health = await fetch('http://127.0.0.1:49003/health');
    expect(await health.json()).toMatchObject({
      status: 'ok',
      questionSource: 'published',
      contentAdminEnabled: false,
    });
    expect((await fetch('http://127.0.0.1:49003/admin/questions')).status).toBe(
      404,
    );
    await expect(
      new Client('http://127.0.0.1:49003').create('kingdom', { name: 'ضيف' }),
    ).rejects.toMatchObject({
      code: 503,
      message: 'CONTENT_BANK_INSUFFICIENT',
    });
  } finally {
    child.kill('SIGTERM');
    const guard = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(guard);
  }
}, 20000);
