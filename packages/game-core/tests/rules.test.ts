import { describe, expect, it } from 'vitest';
import {
  MAP,
  activePlayer,
  applyAction,
  createMatch,
  legalTargets,
  placements,
  publicView,
  resolveDuel,
  seededShuffle,
  validateMap,
} from '../src/index.js';
import type { Action, Duel, MatchState } from '../src/index.js';
import { fixtureQuestion, replay, simulate } from '../src/simulation.js';
import { accept, answer, battle, initial, started } from './helpers.js';

function reject(
  state: MatchState,
  action: Action,
  error: string,
  now = state.lastNow + 1,
) {
  const before = structuredClone(state);
  const result = applyAction(state, action, { now });
  expect(result).toMatchObject({ ok: false, error });
  expect(result.state).toBe(state);
  expect(state).toEqual(before);
}

describe('map and setup', () => {
  it('validates 15 nodes, castle distances and rotational symmetry', () => {
    expect(validateMap(MAP)).toEqual([]);
    for (let i = 0; i < 15; i++)
      expect(
        MAP[i]!.neighbors.map(
          (id) => MAP[(Number(id.slice(2)) + 5) % 15]!.id,
        ).sort(),
      ).toEqual([...MAP[(i + 5) % 15]!.neighbors].sort());
    const distances = (start: string, end: string) => {
      let frontier = [start];
      const seen = new Set(frontier);
      let distance = 0;
      while (!frontier.includes(end)) {
        frontier = frontier
          .flatMap((id) => MAP.find((n) => n.id === id)!.neighbors)
          .filter((id) => !seen.has(id));
        frontier.forEach((id) => seen.add(id));
        distance++;
      }
      return distance;
    };
    expect([
      distances('t_00', 't_05'),
      distances('t_05', 't_10'),
      distances('t_10', 't_00'),
    ]).toEqual([5, 5, 5]);
  });
  it('detects missing, duplicate, disconnected, asymmetric and self edges', () => {
    expect(validateMap(MAP.slice(1))).not.toHaveLength(0);
    expect(validateMap(MAP.map((n) => ({ ...n, neighbors: [] })))).toContain(
      'Map is disconnected',
    );
    expect(
      validateMap(
        MAP.map((n, i) =>
          i ? n : { ...n, neighbors: ['t_00', 'missing', 'missing'] },
        ),
      ),
    ).not.toHaveLength(0);
    expect(validateMap(MAP.map((n, i) => (i ? n : MAP[1]!)))).not.toHaveLength(
      0,
    );
  });
  it('starts with three unique castle owners and twelve neutrals', () => {
    const state = initial();
    expect(state.phase).toBe('LOBBY');
    expect(state.players.map((p) => state.owners[p.homeCastle])).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
    expect(
      Object.values(state.owners).filter((owner) => owner === null),
    ).toHaveLength(12);
    expect(new Set(state.order).size).toBe(3);
    expect(seededShuffle([1, 2, 3], 42)).toEqual(seededShuffle([1, 2, 3], 42));
  });
  it('rejects invalid setup, timers, seeds, names and insufficient unique questions', () => {
    const input = {
      id: 'm',
      players: initial().players,
      seed: 1,
      questionIds: initial().questionDeck,
    };
    expect(() =>
      createMatch({ ...input, players: input.players.slice(1) }),
    ).toThrow();
    expect(() =>
      createMatch({
        ...input,
        players: [input.players[0]!, input.players[0]!, input.players[2]!],
      }),
    ).toThrow();
    expect(() => createMatch({ ...input, seed: -1 })).toThrow();
    expect(() => createMatch({ ...input, questionIds: ['q'] })).toThrow();
    expect(() =>
      createMatch({
        ...input,
        questionIds: Array.from({ length: 36 }, () => 'q'),
      }),
    ).toThrow();
    expect(() => createMatch({ ...input, rules: { maxTurns: 0 } })).toThrow();
    expect(() => createMatch({ ...input, rules: { answerMs: NaN } })).toThrow();
    expect(() =>
      createMatch({
        ...input,
        players: input.players.map((p) => ({ ...p, name: '<script>' })),
      }),
    ).toThrow();
  });
  it('requires every READY and server BEGIN; illegal transitions do not mutate input', () => {
    const state = initial();
    for (const type of ['BEGIN', 'RESOLVE', 'ADVANCE'] as const)
      reject(state, { type }, 'INVALID_PHASE');
    expect(started()).toMatchObject({ phase: 'ATTACK_SELECTION', turn: 1 });
    expect(state.players.every((p) => !p.ready)).toBe(true);
  });
});

describe('intents and idempotency', () => {
  it('rejects foreign match, stale turn, outsider and changed retry', () => {
    const state = initial();
    const action = {
      type: 'READY' as const,
      matchId: state.id,
      turn: 0,
      actor: 'p1',
      key: 'r',
    };
    reject(state, { ...action, matchId: 'wrong' }, 'WRONG_MATCH');
    reject(state, { ...action, turn: 1 }, 'STALE_TURN');
    reject(state, { ...action, actor: 'intruder' }, 'INVALID_ACTOR');
    const next = accept(state, action);
    expect(applyAction(next, action, { now: next.lastNow })).toEqual({
      ok: true,
      state: next,
      duplicate: true,
    });
    reject(next, { ...action, turn: 1 }, 'DUPLICATE_ACTION');
  });
  it('accepts only adjacent non-owned territories for the active player', () => {
    const state = started();
    const actor = activePlayer(state);
    expect(legalTargets(state, actor)).toHaveLength(2);
    const base = {
      type: 'SELECT_TARGET' as const,
      matchId: state.id,
      turn: 1,
      actor,
      key: 's',
    };
    reject(
      state,
      {
        ...base,
        target: state.players.find((p) => p.id === actor)!.homeCastle,
      },
      'ILLEGAL_TARGET',
    );
    reject(state, { ...base, target: 't_02' }, 'ILLEGAL_TARGET');
    reject(state, { ...base, target: 'missing' }, 'ILLEGAL_TARGET');
    reject(
      state,
      {
        ...base,
        actor: state.players.find((p) => p.id !== actor)!.id,
        target: legalTargets(state, actor)[0]!,
      },
      'INVALID_ACTOR',
    );
    expect(battle(state).phase).toBe('DUEL');
    expect(battle(state, true).duel?.defender).not.toBeNull();
  });
  it('rejects malformed or out-of-order server questions', () => {
    const state = started();
    const action = {
      type: 'SELECT_TARGET' as const,
      matchId: state.id,
      turn: 1,
      actor: activePlayer(state),
      key: 's',
      target: legalTargets(state, activePlayer(state))[0]!,
    };
    const question = fixtureQuestion(state.questionDeck[0]!);
    for (const q of [
      { ...question, id: 'wrong' },
      { ...question, correctChoiceId: 'unknown' },
      { ...question, text: '' },
      {
        ...question,
        choices: [
          question.choices[0],
          question.choices[0],
          question.choices[2],
          question.choices[3],
        ] as typeof question.choices,
      },
    ]) {
      const result = applyAction(state, action, { now: 10, question: q });
      expect(result).toMatchObject({ ok: false, error: 'INVALID_QUESTION' });
      expect(result.state).toBe(state);
    }
  });
  it('retries SELECT without opening another duel', () => {
    const state = started();
    const next = battle(state);
    const retry = applyAction(
      next,
      {
        type: 'SELECT_TARGET',
        matchId: state.id,
        turn: 1,
        actor: activePlayer(state),
        key: 'select_1',
        target: next.duel!.target,
      },
      { now: 20 },
    );
    expect(retry).toMatchObject({ ok: true, duplicate: true });
    expect(retry.state).toBe(next);
  });
  it('rejects second submissions with fresh keys and altered retries', () => {
    const state = answer(battle());
    const duel = state.duel!;
    const action = {
      type: 'SUBMIT_ANSWER' as const,
      matchId: state.id,
      turn: 1,
      actor: duel.attacker,
      questionId: duel.question.id,
      key: 'new',
      choiceId: 'b',
    };
    reject(state, action, 'ALREADY_ANSWERED');
    reject(state, { ...action, key: 'answer_1' }, 'DUPLICATE_ACTION');
    expect(
      applyAction(
        state,
        { ...action, choiceId: 'a', key: 'answer_1' },
        { now: state.lastNow },
      ),
    ).toMatchObject({ ok: true, duplicate: true });
  });
  it('rejects wrong choices/questions, outsider, phase and time reversal', () => {
    const state = battle();
    const duel = state.duel!;
    const action = {
      type: 'SUBMIT_ANSWER' as const,
      matchId: state.id,
      turn: 1,
      actor: duel.attacker,
      questionId: duel.question.id,
      key: 'a',
      choiceId: 'unknown',
    };
    reject(state, action, 'INVALID_ANSWER');
    reject(
      state,
      { ...action, choiceId: 'a', questionId: 'old' },
      'INVALID_ANSWER',
    );
    reject(
      state,
      {
        ...action,
        actor: state.players.find((p) => p.id !== duel.attacker)!.id,
      },
      'INVALID_ACTOR',
    );
    reject(started(), action, 'INVALID_PHASE');
    for (const now of [state.lastNow - 1, NaN, Infinity, -1])
      reject(state, action, 'INVALID_TIME', now);
  });
});

describe('timing and battle outcomes', () => {
  it('accepts before deadline, rejects at/after it; missing answer is incorrect', () => {
    const state = battle();
    const duel = state.duel!;
    expect(
      answer(state, duel.attacker, 'a', duel.deadline - 0.001).duel!.answers[
        duel.attacker
      ],
    ).toBeDefined();
    const action = {
      type: 'SUBMIT_ANSWER' as const,
      matchId: state.id,
      turn: 1,
      actor: duel.attacker,
      questionId: duel.question.id,
      choiceId: 'a',
      key: 'a',
    };
    reject(state, action, 'DEADLINE_EXPIRED', duel.deadline);
    reject(state, action, 'DEADLINE_EXPIRED', duel.deadline + 1);
    reject(state, { type: 'RESOLVE' }, 'TOO_EARLY', duel.deadline - 1);
    const resolved = accept(state, { type: 'RESOLVE' }, duel.deadline);
    expect(resolved.owners[duel.target]).toBeNull();
    expect(resolved.outcome?.captured).toBe(false);
  });
  it('captures neutrals only on a correct answer, preserving source territory', () => {
    const state = battle();
    const duel = state.duel!;
    const resolved = accept(answer(state), { type: 'RESOLVE' });
    expect(resolved.owners[duel.target]).toBe(duel.attacker);
    expect(
      resolved.owners[
        state.players.find((p) => p.id === duel.attacker)!.homeCastle
      ],
    ).toBe(duel.attacker);
    expect(
      accept(answer(state, duel.attacker, 'b'), { type: 'RESOLVE' }).outcome
        ?.captured,
    ).toBe(false);
  });
  it.each([
    ['a', 'b', 10, 20, true],
    ['b', 'a', 10, 20, false],
    ['b', 'c', 10, 20, false],
    ['a', 'a', 10, 20, true],
    ['a', 'a', 20, 10, false],
    ['a', 'a', 10, 10, false],
  ])(
    'attacker %s / defender %s at %i / %i: capture %s',
    (a, b, at, bt, captured) => {
      const duel: Duel = {
        attacker: 'p1',
        defender: 'p2',
        target: 't_01',
        question: fixtureQuestion('q'),
        openedAt: 0,
        deadline: 100,
        answers: {
          p1: { choiceId: a, receivedAt: at },
          p2: { choiceId: b, receivedAt: bt },
        },
      };
      expect(resolveDuel(duel).captured).toBe(captured);
    },
  );
  it('requires both answers for early resolution and uses actual receipt order', () => {
    let state = battle(started(), true);
    const defender = state.duel!.defender!;
    state = answer(state, defender, 'a', 10);
    reject(state, { type: 'RESOLVE' }, 'TOO_EARLY', 11);
    state = answer(state, state.duel!.attacker, 'a', 12);
    expect(accept(state, { type: 'RESOLVE' }, 12).outcome?.winner).toBe(
      defender,
    );
  });
  it('deadline resolution beats a same-time late answer in either processing order', () => {
    const state = battle();
    const deadline = state.duel!.deadline;
    const resolved = accept(state, { type: 'RESOLVE' }, deadline);
    const action = {
      type: 'SUBMIT_ANSWER' as const,
      matchId: state.id,
      turn: 1,
      actor: state.duel!.attacker,
      questionId: state.duel!.question.id,
      choiceId: 'a',
      key: 'late',
    };
    reject(state, action, 'DEADLINE_EXPIRED', deadline);
    reject(resolved, action, 'INVALID_PHASE', deadline);
  });
  it('selection skips consume turns without backdating new deadlines', () => {
    const state = started();
    reject(state, { type: 'ADVANCE' }, 'TOO_EARLY');
    const deadline = state.selectionDeadline!;
    reject(
      state,
      {
        type: 'SELECT_TARGET',
        actor: activePlayer(state),
        matchId: state.id,
        turn: 1,
        key: 'late',
        target: legalTargets(state, activePlayer(state))[0]!,
      },
      'DEADLINE_EXPIRED',
      deadline,
    );
    const next = accept(state, { type: 'ADVANCE' }, deadline + 500);
    expect(next.turn).toBe(2);
    expect(activePlayer(next)).not.toBe(activePlayer(state));
    expect(next.selectionDeadline).toBe(
      deadline + 500 + state.rules.selectionMs,
    );
  });
});

describe('termination and privacy', () => {
  it('completes an actual castle-conquest match using only accepted actions', () => {
    let state = started();
    const winner = activePlayer(state);
    const home = Number(
      state.players.find((p) => p.id === winner)!.homeCastle.slice(2),
    );
    let offset = 1;
    let guard = 0;
    while (state.phase !== 'FINISHED' && guard++ < 200) {
      if (state.phase === 'ATTACK_SELECTION') {
        if (activePlayer(state) !== winner) {
          state = accept(state, { type: 'ADVANCE' }, state.selectionDeadline!);
          continue;
        }
        const target = `t_${String((home + offset++) % 15).padStart(2, '0')}`;
        state = accept(
          state,
          {
            type: 'SELECT_TARGET',
            actor: winner,
            matchId: state.id,
            turn: state.turn,
            key: `select_${state.turn}`,
            target,
          },
          state.lastNow + 1,
          fixtureQuestion(state.questionDeck[state.usedQuestionIds.length]!),
        );
      } else if (state.phase === 'DUEL') {
        const defender = state.duel!.defender;
        state = answer(state, winner);
        if (defender) state = answer(state, defender, 'b');
        state = accept(state, { type: 'RESOLVE' });
      } else if (state.phase === 'RESOLUTION')
        state = accept(state, { type: 'ADVANCE' });
      else throw new Error('Unexpected test phase');
    }
    expect(state.result).toMatchObject({
      reason: 'CASTLES',
      winners: [winner],
    });
    expect(state.players.filter((p) => p.eliminated)).toHaveLength(2);
    expect(
      MAP.filter((t) => t.castle).every((t) => state.owners[t.id] === winner),
    ).toBe(true);
  });
  it('handles prototype-like player IDs as opaque identifiers', () => {
    let state = createMatch({
      id: 'm_proto',
      seed: 1,
      players: ['__proto__', 'constructor', 'toString'].map((id) => ({
        id,
        name: 'لاعب',
      })),
      questionIds: initial().questionDeck,
    });
    for (const player of state.players)
      state = accept(state, {
        type: 'READY',
        actor: player.id,
        matchId: state.id,
        turn: 0,
        key: 'ready',
      });
    state = accept(state, { type: 'BEGIN' });
    state = battle(state);
    const actor = state.duel!.attacker;
    state = answer(state, actor);
    expect(Object.hasOwn(state.duel!.answers, actor)).toBe(true);
    expect(accept(state, { type: 'RESOLVE' }).outcome?.captured).toBe(true);
  });
  it('home castle capture transfers lands, eliminates defender and skips their next turn', () => {
    let state = started();
    const actor = activePlayer(state);
    const defender = state.players.find((p) => p.id !== actor)!;
    const castle = MAP.find((n) => n.id === defender.homeCastle)!;
    state.owners[castle.neighbors[0]!] = actor;
    state = accept(
      state,
      {
        type: 'SELECT_TARGET',
        matchId: state.id,
        turn: 1,
        actor,
        key: 'castle',
        target: castle.id,
      },
      10,
      fixtureQuestion(state.questionDeck[0]!),
    );
    state = answer(state, actor, 'a', 11);
    state = answer(state, defender.id, 'b', 12);
    state = accept(state, { type: 'RESOLVE' }, 13);
    expect(state.players.find((p) => p.id === defender.id)?.eliminated).toBe(
      true,
    );
    expect(Object.values(state.owners)).not.toContain(defender.id);
    state = accept(state, { type: 'ADVANCE' }, 14);
    expect(activePlayer(state)).not.toBe(defender.id);
  });
  it('all-castle victory finishes and prevents further actions', () => {
    const state = started();
    const actor = activePlayer(state);
    for (const node of MAP) if (node.castle) state.owners[node.id] = actor;
    const finished = accept(
      state,
      { type: 'ADVANCE' },
      state.selectionDeadline!,
    );
    expect(finished.result).toMatchObject({
      reason: 'CASTLES',
      winners: [actor],
    });
    reject(finished, { type: 'ABORT' }, 'INVALID_PHASE');
  });
  it('no-legal-target skip is immediate; turn limit can produce joint winners', () => {
    const state = started(1);
    const actor = activePlayer(state);
    for (const id of Object.keys(state.owners))
      if (state.owners[id] === actor) state.owners[id] = null;
    expect(legalTargets(state, actor)).toEqual([]);
    expect(accept(state, { type: 'ADVANCE' }).result?.reason).toBe(
      'TURN_LIMIT',
    );
    const tied = started(1);
    const finished = accept(tied, { type: 'ADVANCE' }, tied.selectionDeadline!);
    expect(finished.result?.winners).toHaveLength(3);
    expect(finished.result?.placements.map((p) => p.rank)).toEqual([1, 1, 1]);
  });
  it('scores castles at three and territories at one', () => {
    const state = initial();
    state.owners.t_01 = 'p1';
    expect(placements(state)[0]).toMatchObject({
      playerId: 'p1',
      score: 4,
      castles: 1,
      territories: 2,
      rank: 1,
    });
  });
  it('forfeits neutralize lands, cancel duels, end on sole survivor; abort has no winners', () => {
    let state = battle();
    const first = state.duel!.attacker;
    state = accept(state, { type: 'FORFEIT', playerId: first });
    expect(state.phase).toBe('RESOLUTION');
    expect(state.duel).toBeNull();
    expect(Object.values(state.owners)).not.toContain(first);
    state = accept(state, {
      type: 'FORFEIT',
      playerId: state.players.find((p) => !p.eliminated)!.id,
    });
    expect(state.result?.reason).toBe('LAST_PLAYER');
    expect(state.result?.winners).toHaveLength(1);
    expect(
      accept(initial(), { type: 'FORFEIT', playerId: 'p1' }).result,
    ).toMatchObject({ reason: 'ABORTED', winners: [] });
    expect(accept(started(), { type: 'ABORT' }).result?.winners).toEqual([]);
  });
  it('projects only public data without aliasing or answer disclosure before resolution', () => {
    const state = answer(battle());
    const serialized = JSON.stringify(publicView(state));
    for (const secret of [
      'correctChoiceId',
      'answers',
      'receivedAt',
      'accepted',
      'questionDeck',
      'usedQuestionIds',
    ])
      expect(serialized).not.toContain(secret);
    const view = publicView(state);
    view.players[0]!.name = 'changed';
    view.question!.choices[0]!.text = 'changed';
    expect(state.players[0]!.name).not.toBe('changed');
    expect(state.duel!.question.choices[0].text).not.toBe('changed');
    expect(
      publicView(accept(state, { type: 'RESOLVE' })).outcome?.correctChoiceId,
    ).toBe('a');
  });
  it('finishes and replays the complete seeded match with no repeated question ID', () => {
    const one = simulate(2026);
    expect(one).toEqual(simulate(2026));
    expect(one.state.phase).toBe('FINISHED');
    expect(one.state.turn).toBeLessThanOrEqual(36);
    expect(one.state.result?.winners.length).toBeGreaterThan(0);
    expect(new Set(one.state.usedQuestionIds).size).toBe(
      one.state.usedQuestionIds.length,
    );
    const fresh = createMatch({
      id: 'm_demo',
      players: [
        { id: 'p_teal', name: 'فيروز' },
        { id: 'p_blue', name: 'ياقوت' },
        { id: 'p_gold', name: 'كهرمان' },
      ],
      seed: 2026,
      questionIds: Array.from({ length: 36 }, (_, i) => `q_${i}`),
    });
    expect(replay(fresh, one.actions)).toEqual(one.state);
    expect(
      applyAction(one.state, one.actions[0]!.action, {
        now: one.state.lastNow,
      }),
    ).toMatchObject({ ok: true, duplicate: true });
  });
});
