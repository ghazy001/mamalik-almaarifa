import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createBasicRankingRepository,
  createMatchResultRepository,
  createQuestionRepository,
  migrateDatabase,
  openDatabase,
  rankingContributions,
} from '@mamalik/database';
import type { MatchArchive, MatchParticipant } from '@mamalik/database';
import { personalStandingSchema } from '@mamalik/shared';
import { createGameService } from '../src/server.js';
import { createPlayerAccess } from '../src/player-access.js';
import { createPlayerStanding } from '../src/player-standing.js';
import { createContentAuthenticator } from '../src/content-auth.js';
import { startAuthFixture } from './support/auth-server.js';
import {
  rankingArchive,
  castleArchive,
  rankingQuestion,
} from './support/ranking-fixture.js';
const url = process.env.DATABASE_URL;
if (!url || !/^\/mamalik_test_[0-9a-f]{32}$/.test(new URL(url).pathname))
  throw new Error('Use pnpm test:standing');
const database = openDatabase(url),
  results = createMatchResultRepository(database.db),
  ranking = createBasicRankingRepository(database.db);
let auth: Awaited<ReturnType<typeof startAuthFixture>>,
  service: ReturnType<typeof createGameService>,
  question = '',
  base = '',
  fail = false;
const accounts = Array.from({ length: 5 }, () => randomUUID());
const [a, b, c, d, e] = accounts as [string, string, string, string, string];
function roster(
  issuer: string,
  users: string[] = accounts.slice(0, 3),
): MatchParticipant[] {
  return users.map((subject, index) => ({
    subject,
    issuer,
    playerId: (['p_teal', 'p_blue', 'p_gold'] as const)[index]!,
  }));
}
async function read(subject = a, query = '') {
  return fetch(`${base}/player/standing${query}`, {
    headers: { Authorization: `Bearer ${await auth.token(subject)}` },
  });
}
beforeAll(async () => {
  await migrateDatabase(database.db);
  const questions = createQuestionRepository(database.db);
  const draft = await questions.createDraft(rankingQuestion, 'test-editor');
  question = draft.questionId;
  await questions.approve(question, 1, 'test-reviewer', 'Fixture only');
  await questions.publish(question, 1, 'test-publisher');
  auth = await startAuthFixture();
  const standing = createPlayerStanding(database.db);
  service = createGameService(
    {
      playerAccess: createPlayerAccess(
        createContentAuthenticator(auth.url, auth.key),
      ),
    },
    undefined,
    undefined,
    async (identity) => {
      if (fail) throw new Error('private SQL canary');
      return standing(identity);
    },
  );
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server!.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await service?.gracefullyShutdown(false);
  await auth?.close();
  await database.close();
});
it('authenticates fresh reads, rejects selectors and browser origins, and returns an unranked private DTO', async () => {
  expect((await fetch(`${base}/player/standing`)).status).toBe(401);
  expect(
    (
      await fetch(`${base}/player/standing`, {
        headers: { Authorization: 'Bearer a.b.c' },
      })
    ).status,
  ).toBe(401);
  for (const query of [
    '?subject=victim',
    '?issuer=other',
    '?cursor=a',
    '?limit=100',
    '?points=9',
    '?subject=a&subject=b',
  ])
    expect((await read(a, query)).status).toBe(400);
  expect(
    (
      await fetch(`${base}/player/standing`, {
        headers: {
          Authorization: `Bearer ${await auth.token(a)}`,
          Origin: 'https://untrusted.example',
        },
      })
    ).status,
  ).toBe(403);
  const response = await read();
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({
    policyVersion: 'basic-v1',
    points: 0,
    position: null,
    eligibleMatches: 0,
    soleWins: 0,
    sharedWins: 0,
  });
});
it('matches the pure eligibility policy for every source/mode/reason/rule/roster exclusion and shared winner', async () => {
  const seed = rankingArchive('m_seed', question);
  const variants: MatchArchive[] = [
    seed,
    castleArchive(seed),
    rankingArchive('m_two', question, ['p_teal', 'p_blue']),
    rankingArchive('m_three', question, ['p_teal', 'p_blue', 'p_gold']),
    { ...seed, mode: 'private' },
    { ...seed, questionSource: 'development' },
    { ...seed, usedQuestionIds: [] },
    { ...seed, finalTurn: 0 },
    { ...seed, rules: { ...seed.rules, maxTurns: 1 }, finalTurn: 1 },
    { ...seed, rules: { ...seed.rules, selectionMs: 5000 } },
    { ...seed, rules: { ...seed.rules, answerMs: 1000 } },
    { ...seed, result: { ...seed.result, reason: 'ABORTED', winners: [] } },
    { ...seed, result: { ...seed.result, reason: 'LAST_PLAYER' } },
    seed,
    seed,
  ];
  for (const [index, variant] of variants.entries()) {
    const issuer = 'https://parity.example/auth/v1',
      users = Array.from({ length: 3 }, () => randomUUID());
    let bindings = roster(issuer, users);
    if (index === 13) bindings = bindings.slice(0, 2);
    if (index === 14)
      bindings = bindings.map((row, i) =>
        i ? row : { ...row, issuer: 'https://other.example/auth/v1' },
      );
    const archive = { ...variant, matchId: `m_policy_${index}` };
    const contributions = rankingContributions(archive, bindings);
    await results.write(archive, bindings);
    for (const [i, subject] of users.entries()) {
      const actual = await ranking.standingFor({ issuer, subject });
      const expected = contributions.find(
        (row) => row.playerId === (['p_teal', 'p_blue', 'p_gold'] as const)[i],
      );
      expect(actual).toMatchObject({
        points: expected?.points ?? 0,
        eligibleMatches: expected ? 1 : 0,
        soleWins: expected?.soleWins ?? 0,
        sharedWins: expected?.sharedWins ?? 0,
      });
      expect(actual.position === null).toBe(!expected);
    }
  }
});
it('ranks previously saved results densely, includes zero-point participants and isolates Auth projects', async () => {
  let index = 0;
  for (const winner of [a, a, b, b, c, c])
    await results.write(
      rankingArchive(`m_totals_${index++}`, question),
      roster(auth.issuer, [winner, e, d]),
    );
  await results.write(
    rankingArchive('m_shared_ad', question, ['p_teal', 'p_blue']),
    roster(auth.issuer, [a, d, e]),
  );
  // Same UUID under a foreign project cannot affect this project's points/rank.
  await results.write(
    rankingArchive('m_foreign', question),
    roster('https://foreign.example/auth/v1', [a, b, c]),
  );
  for (const [subject, points, position] of [
    [a, 7, 1],
    [b, 6, 2],
    [c, 6, 2],
    [d, 1, 3],
    [e, 0, 4],
  ] as const)
    expect(
      await ranking.standingFor({ issuer: auth.issuer, subject }),
    ).toMatchObject({ points, position });
  const response = await read();
  const text = await response.text();
  expect(personalStandingSchema.parse(JSON.parse(text))).toMatchObject({
    points: 7,
    position: 1,
    eligibleMatches: 3,
    soleWins: 2,
    sharedWins: 1,
  });
  expect(text).not.toMatch(
    /issuer|subject|bankHash|question|token|email|playerId/,
  );
});
it('counts exact retries once and sees concurrent commits without a mutable points balance', async () => {
  const archive = rankingArchive('m_retry', question),
    bindings = roster(auth.issuer, [a, e, d]);
  await Promise.all([
    results.write(archive, bindings),
    results.write(archive, bindings),
  ]);
  expect(
    await ranking.standingFor({ issuer: auth.issuer, subject: a }),
  ).toMatchObject({ points: 10, eligibleMatches: 4 });
  await expect(
    results.write({ ...archive, seed: 1 }, bindings),
  ).rejects.toThrow('MATCH_ARCHIVE_CONFLICT');
  await expect(
    results.write(archive, roster(auth.issuer, [a, e, c])),
  ).rejects.toThrow('MATCH_ARCHIVE_CONFLICT');
  await Promise.all(
    ['m_concurrent_1', 'm_concurrent_2'].map((id) =>
      results.write(
        rankingArchive(id, question),
        roster(auth.issuer, [b, e, d]),
      ),
    ),
  );
  expect(await (await read()).json()).toMatchObject({
    points: 10,
    position: 2,
  });
});
it('fails closed for revoked credentials/storage failure and recovers without changing saved results', async () => {
  auth.revoked.add(a);
  expect((await read()).status).toBe(401);
  auth.revoked.delete(a);
  fail = true;
  const bad = await read();
  expect(bad.status).toBe(503);
  expect(await bad.text()).toBe('{"error":"STANDING_UNAVAILABLE"}');
  fail = false;
  expect((await read()).status).toBe(200);
  expect(await results.get('m_retry')).not.toBeNull();
});
