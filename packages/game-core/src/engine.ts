import { MAP, validateMap } from './map.js';
import type {
  Action,
  ApplyResult,
  Context,
  Duel,
  ErrorCode,
  MatchResult,
  MatchState,
  Outcome,
  Placement,
  PlayerAction,
  Question,
  Rules,
} from './types.js';

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  version: 1,
  maxTurns: 36,
  selectionMs: 10_000,
  answerMs: 15_000,
});
const validId = (id: string): boolean => /^[a-zA-Z0-9_-]{1,64}$/.test(id);

/** Stable xorshift32 + Fisher–Yates; no ambient randomness. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  let value = seed >>> 0 || 1;
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const other = (value >>> 0) % (index + 1);
    const a = result[index];
    const b = result[other];
    if (a !== undefined && b !== undefined) {
      result[index] = b;
      result[other] = a;
    }
  }
  return result;
}

export function createMatch(input: {
  id: string;
  players: readonly { id: string; name: string }[];
  seed: number;
  questionIds: readonly string[];
  rules?: Partial<Omit<Rules, 'version'>>;
}): MatchState {
  const rules: Rules = { ...DEFAULT_RULES, ...input.rules };
  if (
    !validId(input.id) ||
    input.players.length !== 3 ||
    new Set(input.players.map((p) => p.id)).size !== 3 ||
    input.players.some(
      (p) =>
        !validId(p.id) ||
        !p.name.trim() ||
        p.name.length > 40 ||
        /[<>]/.test(p.name) ||
        [...p.name].some((character) => character.charCodeAt(0) < 32),
    )
  )
    throw new Error('Invalid match or players');
  if (
    !Number.isInteger(input.seed) ||
    input.seed < 0 ||
    input.seed > 0xffffffff
  )
    throw new Error('Invalid seed');
  if (
    !Number.isInteger(rules.maxTurns) ||
    rules.maxTurns < 1 ||
    rules.maxTurns > 120 ||
    ![rules.selectionMs, rules.answerMs].every(
      (v) => Number.isInteger(v) && v >= 100 && v <= 60_000,
    )
  )
    throw new Error('Invalid rules');
  if (
    input.questionIds.length < rules.maxTurns ||
    new Set(input.questionIds).size !== input.questionIds.length ||
    input.questionIds.some((id) => !validId(id))
  )
    throw new Error('Insufficient unique questions');
  if (validateMap(MAP).length) throw new Error('Invalid built-in map');
  const castles = MAP.filter((node) => node.castle);
  const players = input.players.map((p, index) => ({
    ...p,
    name: p.name.trim(),
    homeCastle: castles[index]!.id,
    ready: false,
    eliminated: false,
  }));
  return {
    id: input.id,
    rules,
    phase: 'LOBBY',
    players,
    order: seededShuffle(
      players.map((p) => p.id),
      input.seed,
    ),
    turn: 0,
    activeIndex: 0,
    owners: Object.fromEntries(
      MAP.map((node) => [
        node.id,
        players.find((p) => p.homeCastle === node.id)?.id ?? null,
      ]),
    ),
    selectionDeadline: null,
    duel: null,
    outcome: null,
    result: null,
    questionDeck: seededShuffle(input.questionIds, input.seed ^ 0x9e3779b9),
    usedQuestionIds: [],
    lastNow: 0,
    accepted: {},
  };
}

export const activePlayer = (state: MatchState): string =>
  state.order[state.activeIndex]!;
export function legalTargets(state: MatchState, actor: string): string[] {
  if (!state.players.some((p) => p.id === actor && !p.eliminated)) return [];
  return MAP.filter(
    (node) =>
      state.owners[node.id] !== actor &&
      node.neighbors.some((id) => state.owners[id] === actor),
  ).map((node) => node.id);
}

export function placements(state: MatchState): Placement[] {
  const rows = state.players
    .map((player) => {
      const owned = MAP.filter((node) => state.owners[node.id] === player.id);
      const castles = owned.filter((node) => node.castle).length;
      return {
        playerId: player.id,
        score: owned.length + castles * 2,
        castles,
        territories: owned.length,
        eliminated: player.eliminated,
        rank: 0,
      };
    })
    .sort(
      (a, b) =>
        Number(a.eliminated) - Number(b.eliminated) ||
        b.score - a.score ||
        b.castles - a.castles ||
        b.territories - a.territories,
    );
  return rows.map((row, index) => {
    const firstEqual = rows.findIndex(
      (other) =>
        other.eliminated === row.eliminated &&
        other.score === row.score &&
        other.castles === row.castles &&
        other.territories === row.territories,
    );
    return { ...row, rank: firstEqual < 0 ? index + 1 : firstEqual + 1 };
  });
}

function finish(state: MatchState, reason: MatchResult['reason']): void {
  const ranked = placements(state);
  state.phase = 'FINISHED';
  state.selectionDeadline = null;
  state.duel = null;
  state.result = {
    reason,
    winners:
      reason === 'ABORTED'
        ? []
        : ranked
            .filter((p) => p.rank === 1 && !p.eliminated)
            .map((p) => p.playerId),
    placements: ranked,
  };
}
function checkVictory(state: MatchState): boolean {
  const living = state.players.filter((p) => !p.eliminated);
  if (
    living.some((p) =>
      MAP.filter((node) => node.castle).every(
        (node) => state.owners[node.id] === p.id,
      ),
    )
  ) {
    finish(state, 'CASTLES');
    return true;
  }
  if (living.length <= 1) {
    finish(state, living.length ? 'LAST_PLAYER' : 'ABORTED');
    return true;
  }
  return false;
}
function advance(state: MatchState, now: number): void {
  if (checkVictory(state)) return;
  if (state.turn >= state.rules.maxTurns) {
    finish(state, 'TURN_LIMIT');
    return;
  }
  do {
    state.activeIndex = (state.activeIndex + 1) % state.order.length;
  } while (state.players.find((p) => p.id === activePlayer(state))!.eliminated);
  state.turn++;
  state.phase = 'ATTACK_SELECTION';
  state.selectionDeadline = now + state.rules.selectionMs;
  state.duel = null;
  state.outcome = null;
}

export function resolveDuel(duel: Duel): Outcome {
  const attacker = Object.hasOwn(duel.answers, duel.attacker)
    ? duel.answers[duel.attacker]
    : undefined;
  const defender =
    duel.defender && Object.hasOwn(duel.answers, duel.defender)
      ? duel.answers[duel.defender]
      : undefined;
  const attackCorrect = attacker?.choiceId === duel.question.correctChoiceId;
  const defendCorrect = defender?.choiceId === duel.question.correctChoiceId;
  const captured =
    attackCorrect &&
    (!defendCorrect || attacker!.receivedAt < defender!.receivedAt);
  return {
    target: duel.target,
    captured,
    winner: captured ? duel.attacker : duel.defender,
    correctChoiceId: duel.question.correctChoiceId,
    questionId: duel.question.id,
  };
}
function validQuestion(question: Question): boolean {
  return (
    validId(question.id) &&
    question.text.trim().length > 0 &&
    question.text.length <= 500 &&
    question.choices.length === 4 &&
    new Set(question.choices.map((c) => c.id)).size === 4 &&
    question.choices.every(
      (c) => validId(c.id) && c.text.trim().length > 0 && c.text.length <= 200,
    ) &&
    question.choices.some((c) => c.id === question.correctChoiceId)
  );
}
function fingerprint(action: PlayerAction): string {
  return JSON.stringify([
    action.type,
    action.matchId,
    action.turn,
    action.actor,
    action.type === 'SELECT_TARGET' ? action.target : null,
    action.type === 'SUBMIT_ANSWER' ? action.questionId : null,
    action.type === 'SUBMIT_ANSWER' ? action.choiceId : null,
  ]);
}

/** Trusted API. Parse untrusted transport input before constructing an action. */
export function applyAction(
  state: MatchState,
  action: Action,
  context: Context,
): ApplyResult {
  const reject = (error: ErrorCode): ApplyResult => ({
    ok: false,
    state,
    error,
  });
  const playerAction = 'actor' in action ? action : null;
  const ledgerKey = playerAction
    ? `${playerAction.actor}:${playerAction.key}`
    : null;
  if (playerAction) {
    if (
      !validId(playerAction.key) ||
      !validId(playerAction.actor) ||
      !Number.isInteger(playerAction.turn) ||
      playerAction.turn < 0
    )
      return reject('INVALID_INPUT');
    if (playerAction.matchId !== state.id) return reject('WRONG_MATCH');
    const existing = state.accepted[ledgerKey!];
    if (existing !== undefined)
      return existing === fingerprint(playerAction)
        ? { ok: true, state, duplicate: true }
        : reject('DUPLICATE_ACTION');
  }
  if (
    !Number.isFinite(context.now) ||
    context.now < state.lastNow ||
    context.now < 0 ||
    context.now > Number.MAX_SAFE_INTEGER - 60_000
  )
    return reject('INVALID_TIME');
  if (state.phase === 'FINISHED') return reject('INVALID_PHASE');
  if (
    playerAction &&
    !state.players.some((p) => p.id === playerAction.actor && !p.eliminated)
  )
    return reject('INVALID_ACTOR');
  if (playerAction && playerAction.turn !== state.turn)
    return reject('STALE_TURN');
  const next = structuredClone(state);
  const now = context.now;
  switch (action.type) {
    case 'READY': {
      if (state.phase !== 'LOBBY') return reject('INVALID_PHASE');
      const player = next.players.find((p) => p.id === action.actor)!;
      if (player.ready) return reject('INVALID_PHASE');
      player.ready = true;
      if (next.players.every((p) => p.ready)) next.phase = 'SETUP';
      break;
    }
    case 'BEGIN':
      if (state.phase !== 'SETUP') return reject('INVALID_PHASE');
      next.turn = 1;
      next.phase = 'ATTACK_SELECTION';
      next.selectionDeadline = now + next.rules.selectionMs;
      break;
    case 'SELECT_TARGET': {
      if (state.phase !== 'ATTACK_SELECTION') return reject('INVALID_PHASE');
      if (action.actor !== activePlayer(state)) return reject('INVALID_ACTOR');
      if (now >= state.selectionDeadline!) return reject('DEADLINE_EXPIRED');
      if (!legalTargets(state, action.actor).includes(action.target))
        return reject('ILLEGAL_TARGET');
      const question = context.question;
      if (
        !question ||
        !validQuestion(question) ||
        question.id !== state.questionDeck[state.usedQuestionIds.length]
      )
        return reject('INVALID_QUESTION');
      next.duel = {
        target: action.target,
        attacker: action.actor,
        defender: state.owners[action.target] ?? null,
        question: structuredClone(question),
        openedAt: now,
        deadline: now + state.rules.answerMs,
        answers: {},
      };
      next.usedQuestionIds.push(question.id);
      next.selectionDeadline = null;
      next.outcome = null;
      next.phase = 'DUEL';
      break;
    }
    case 'SUBMIT_ANSWER': {
      if (state.phase !== 'DUEL' || !state.duel) return reject('INVALID_PHASE');
      const duel = next.duel!;
      if (![duel.attacker, duel.defender].includes(action.actor))
        return reject('INVALID_ACTOR');
      if (now >= duel.deadline) return reject('DEADLINE_EXPIRED');
      if (Object.hasOwn(duel.answers, action.actor))
        return reject('ALREADY_ANSWERED');
      if (
        action.questionId !== duel.question.id ||
        !duel.question.choices.some((c) => c.id === action.choiceId)
      )
        return reject('INVALID_ANSWER');
      duel.answers = {
        ...duel.answers,
        [action.actor]: { choiceId: action.choiceId, receivedAt: now },
      };
      break;
    }
    case 'RESOLVE': {
      if (state.phase !== 'DUEL' || !state.duel) return reject('INVALID_PHASE');
      const duel = state.duel;
      const participants = [
        duel.attacker,
        ...(duel.defender ? [duel.defender] : []),
      ];
      if (
        now < duel.deadline &&
        !participants.every((id) => Object.hasOwn(duel.answers, id))
      )
        return reject('TOO_EARLY');
      const outcome = resolveDuel(duel);
      next.outcome = outcome;
      if (outcome.captured) {
        next.owners[duel.target] = duel.attacker;
        const defender = next.players.find((p) => p.id === duel.defender);
        if (defender?.homeCastle === duel.target) {
          defender.eliminated = true;
          for (const id of Object.keys(next.owners))
            if (next.owners[id] === defender.id)
              next.owners[id] = duel.attacker;
        }
      }
      next.duel = null;
      next.phase = 'RESOLUTION';
      checkVictory(next);
      break;
    }
    case 'ADVANCE':
      if (state.phase !== 'RESOLUTION' && state.phase !== 'ATTACK_SELECTION')
        return reject('INVALID_PHASE');
      if (
        state.phase === 'ATTACK_SELECTION' &&
        now < state.selectionDeadline! &&
        legalTargets(state, activePlayer(state)).length > 0
      )
        return reject('TOO_EARLY');
      advance(next, now);
      break;
    case 'FORFEIT': {
      const player = next.players.find(
        (p) => p.id === action.playerId && !p.eliminated,
      );
      if (!player) return reject('INVALID_ACTOR');
      player.eliminated = true;
      for (const id of Object.keys(next.owners))
        if (next.owners[id] === player.id) next.owners[id] = null;
      if (state.phase === 'LOBBY' || state.phase === 'SETUP')
        finish(next, 'ABORTED');
      else if (
        !checkVictory(next) &&
        (state.phase === 'DUEL' ||
          (state.phase === 'ATTACK_SELECTION' &&
            action.playerId === activePlayer(state)))
      ) {
        next.phase = 'RESOLUTION';
        next.duel = null;
        next.selectionDeadline = null;
      }
      break;
    }
    case 'ABORT':
      finish(next, 'ABORTED');
      break;
  }
  next.lastNow = now;
  if (ledgerKey && playerAction)
    next.accepted[ledgerKey] = fingerprint(playerAction);
  return { ok: true, state: next, duplicate: false };
}

/** Explicit allowlist. Never serialize MatchState directly to a browser. */
export function publicView(state: MatchState) {
  return {
    matchId: state.id,
    rulesVersion: state.rules.version,
    phase: state.phase,
    turn: state.turn,
    activePlayerId:
      state.phase === 'LOBBY' ||
      state.phase === 'SETUP' ||
      state.phase === 'FINISHED'
        ? null
        : activePlayer(state),
    players: state.players.map(({ id, name, ready, eliminated }) => ({
      id,
      name,
      ready,
      eliminated,
    })),
    territories: MAP.map((node) => ({
      id: node.id,
      castle: node.castle,
      ownerId: state.owners[node.id] ?? null,
    })),
    selectionDeadline: state.selectionDeadline,
    question: state.duel
      ? {
          id: state.duel.question.id,
          text: state.duel.question.text,
          choices: state.duel.question.choices.map(({ id, text }) => ({
            id,
            text,
          })),
          deadline: state.duel.deadline,
          targetId: state.duel.target,
          attackerId: state.duel.attacker,
          defenderId: state.duel.defender,
        }
      : null,
    outcome: state.outcome ? { ...state.outcome } : null,
    result: state.result ? structuredClone(state.result) : null,
  };
}
