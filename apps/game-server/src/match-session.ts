import {
  applyAction,
  createMatch,
  activePlayer,
  legalTargets,
  placements,
  publicView,
  DEFAULT_RULES,
} from '@mamalik/game-core';
import type { MatchState, Rules, ServerAction } from '@mamalik/game-core';
import { developmentQuestionBank } from './question-bank.js';
import type { QuestionBank } from './question-bank.js';
import type { RoomSnapshot } from '@mamalik/shared';
import { processIntent, snapshot } from './commands.js';

export interface SessionOptions {
  id: string;
  players: { id: string; name: string }[];
  seed: number;
  rules?: Partial<Omit<Rules, 'version'>>;
  resolutionMs?: number;
  bank?: QuestionBank;
}

/** Server-only explicit-time orchestration. Every domain mutation goes through core. */
export function createServerMatch(options: SessionOptions) {
  const bank =
    options.bank ??
    developmentQuestionBank(options.rules?.maxTurns ?? DEFAULT_RULES.maxTurns);
  let state: MatchState = createMatch({
    id: options.id,
    players: options.players,
    seed: options.seed,
    questionIds: bank.ids,
    ...(options.rules ? { rules: options.rules } : {}),
  });
  let reveal: RoomSnapshot['reveal'] = null;
  let observedAt = 0;
  let revision = 0;
  let resolvedChoices: Record<string, string> = {};
  const resolutionMs = options.resolutionMs ?? 3000;

  function accept(next: MatchState) {
    if (next === state) return;
    const previous = state;
    state = next;
    revision++;
    if (state.outcome && previous.duel) {
      resolvedChoices = Object.fromEntries(
        Object.entries(previous.duel.answers).map(([id, answer]) => [
          id,
          answer.choiceId,
        ]),
      );
      const fixture = bank.get(previous.duel.question.id);
      reveal = {
        question: snapshot(previous).question!,
        explanation: fixture.explanation,
        source: fixture.source,
      };
    } else if (state.phase === 'ATTACK_SELECTION') {
      reveal = null;
      resolvedChoices = {};
    }
  }
  function lifecycle(action: ServerAction, now: number) {
    const result = applyAction(state, action, { now });
    if (!result.ok) throw new Error(`Room lifecycle rejected: ${result.error}`);
    accept(result.state);
  }
  function tick(now: number) {
    if (!Number.isFinite(now) || now < observedAt) return;
    observedAt = now;
    // Start each new phase at processing time: a delayed event loop must not
    // silently consume every future human turn using backdated deadlines.
    if (state.phase === 'SETUP') lifecycle({ type: 'BEGIN' }, now);
    if (
      state.phase === 'ATTACK_SELECTION' &&
      (now >= state.selectionDeadline! ||
        !legalTargets(state, activePlayer(state)).length)
    )
      lifecycle({ type: 'ADVANCE' }, now);
    else if (state.phase === 'DUEL' && state.duel) {
      const ids = [
        state.duel.attacker,
        ...(state.duel.defender ? [state.duel.defender] : []),
      ];
      if (
        now >= state.duel.deadline ||
        ids.every((id) => Object.hasOwn(state.duel!.answers, id))
      )
        lifecycle({ type: 'RESOLVE' }, now);
    } else if (
      state.phase === 'RESOLUTION' &&
      now >= state.lastNow + resolutionMs
    )
      lifecycle({ type: 'ADVANCE' }, now);
  }
  return {
    tick,
    get revision() {
      return revision;
    },
    get finished() {
      return state.phase === 'FINISHED';
    },
    command(input: unknown, playerId: string, now: number) {
      if (!Number.isFinite(now) || now < observedAt)
        return { ok: false as const, state, error: 'INVALID_TIME' as const };
      tick(now);
      const questionId = state.questionDeck[state.usedQuestionIds.length];
      const result = processIntent(state, input, playerId, {
        now,
        ...(questionId ? { question: bank.get(questionId).question } : {}),
      });
      if (result.ok) {
        accept(result.state);
        tick(now);
      }
      return result;
    },
    forfeit(playerId: string, now: number) {
      tick(now);
      if (
        !state.players.find((player) => player.id === playerId)?.eliminated &&
        !this.finished
      )
        lifecycle({ type: 'FORFEIT', playerId }, now);
    },
    abort(now: number) {
      if (!this.finished)
        lifecycle({ type: 'ABORT' }, Math.max(now, observedAt));
    },
    view(playerId: string) {
      const own = state.duel?.answers[playerId];
      return {
        state: snapshot(state),
        legalTargetIds:
          state.phase === 'ATTACK_SELECTION' && activePlayer(state) === playerId
            ? legalTargets(state, playerId)
            : [],
        standings: placements(state),
        rules: {
          maxTurns: state.rules.maxTurns,
          selectionMs: state.rules.selectionMs,
          answerMs: state.rules.answerMs,
        },
        ownChoiceId: own?.choiceId ?? resolvedChoices[playerId] ?? null,
        reveal,
      };
    },
    // Explicit allowlist for tests, never expose private reducer state.
    publicState: () => publicView(state),
    // Server-only, answer-free archive projection. Never synchronize this object.
    archive() {
      if (state.phase !== 'FINISHED' || !state.result) return null;
      return {
        archiveVersion: 1 as const,
        matchId: state.id,
        seed: options.seed,
        bankHash: bank.fingerprint,
        rules: structuredClone(state.rules),
        finalTurn: state.turn,
        turnOrder: [...state.order],
        territories: Object.entries(state.owners).map(([id, ownerId]) => ({
          id,
          ownerId,
        })),
        usedQuestionIds: [...state.usedQuestionIds],
        result: structuredClone(state.result),
      };
    },
  };
}
