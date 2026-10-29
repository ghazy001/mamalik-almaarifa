import { PROTOCOL_VERSION } from '@mamalik/shared';
import { describe, expect, it } from 'vitest';
import { findFixture } from '@mamalik/question-fixtures';
import { createServerMatch } from '../src/match-session.js';

const create = () =>
  createServerMatch({
    id: 'm_test',
    seed: 2026,
    players: [
      { id: 'p_teal', name: 'أ' },
      { id: 'p_blue', name: 'ب' },
      { id: 'p_gold', name: 'ج' },
    ],
  });
function command(
  session: ReturnType<typeof create>,
  player: string,
  type: string,
  at: number,
  fields: Record<string, string> = {},
) {
  const state = session.view(player).state;
  return session.command(
    {
      protocolVersion: PROTOCOL_VERSION,
      type,
      matchId: state.matchId,
      turn: state.turn,
      idempotencyKey: `${type}_${state.turn}`,
      ...fields,
    },
    player,
    at,
  );
}
function ready(session: ReturnType<typeof create>) {
  for (const player of session.view('').state.players)
    command(session, player.id, 'READY', 0);
}
describe('authoritative match session', () => {
  it('starts only after all seats ready, and lets only the active seat choose a legal target', () => {
    const session = create();
    command(session, 'p_teal', 'READY', 0);
    session.tick(1000);
    expect(session.view('').state.phase).toBe('LOBBY');
    command(session, 'p_blue', 'READY', 1000);
    command(session, 'p_gold', 'READY', 1000);
    const state = session.view('').state;
    expect(state.phase).toBe('ATTACK_SELECTION');
    const actor = state.activePlayerId!;
    const target = session.view(actor).legalTargetIds[0]!;
    expect(session.view('outsider').legalTargetIds).toEqual([]);
    expect(
      command(session, 'outsider', 'SELECT_TARGET', 1100, { targetId: target })
        .ok,
    ).toBe(false);
    expect(
      command(session, actor, 'SELECT_TARGET', 1100, { targetId: target }).ok,
    ).toBe(true);
    const during = session.view(actor);
    expect(JSON.stringify(during)).not.toContain('correctChoiceId');
    const correct = findFixture(during.state.question!.id).question
      .correctChoiceId;
    expect(
      command(session, actor, 'SUBMIT_ANSWER', 1200, {
        questionId: during.state.question!.id,
        choiceId: correct,
      }).ok,
    ).toBe(true);
    expect(session.view(actor).state.phase).toBe('RESOLUTION');
    expect(session.view(actor).ownChoiceId).toBe(correct);
    expect(session.view('p_blue').ownChoiceId).toBe(
      actor === 'p_blue' ? correct : null,
    );
    expect(session.view(actor).reveal?.explanation).toBeTruthy();
    expect(
      command(session, actor, 'SUBMIT_ANSWER', 1250, {
        questionId: during.state.question!.id,
        choiceId: correct,
      }),
    ).toMatchObject({ ok: true, duplicate: true });
    session.tick(4200);
    expect(session.view('').state.turn).toBe(2);
  });
  it('rejects deadline submissions and backward timestamps, and gives a delayed next turn its full window', () => {
    const session = create();
    ready(session);
    const actor = session.view('').state.activePlayerId!;
    command(session, actor, 'SELECT_TARGET', 10, {
      targetId: session.view(actor).legalTargetIds[0]!,
    });
    const question = session.view(actor).state.question!;
    const response = command(
      session,
      actor,
      'SUBMIT_ANSWER',
      question.deadline,
      { questionId: question.id, choiceId: 'a' },
    );
    expect(response.ok).toBe(false);
    expect(session.view(actor).state.outcome?.captured).toBe(false);
    expect(command(session, actor, 'READY', 1)).toMatchObject({
      ok: false,
      error: 'INVALID_TIME',
    });
    session.tick(100000);
    expect(session.view('').state.selectionDeadline).toBe(110000);
  });
  it('completes three real seats through rules without bot answers', () => {
    const session = create();
    ready(session);
    let time = 1;
    for (let guard = 0; guard < 200 && !session.finished; guard++) {
      const state = session.view('').state;
      const actor = state.activePlayerId!;
      if (state.phase === 'ATTACK_SELECTION') {
        const target = session.view(actor).legalTargetIds[0];
        if (target)
          command(session, actor, 'SELECT_TARGET', time, { targetId: target });
        else session.tick(time);
      } else if (state.phase === 'DUEL') {
        for (const id of [
          state.question!.attackerId,
          state.question!.defenderId,
        ].filter((id): id is string => !!id)) {
          command(session, id, 'SUBMIT_ANSWER', time, {
            questionId: state.question!.id,
            choiceId: findFixture(state.question!.id).question.correctChoiceId,
          });
          time++;
        }
      } else {
        time += 3000;
        session.tick(time);
      }
      time++;
    }
    expect(session.finished).toBe(true);
    expect(session.view('').state.result?.placements).toHaveLength(3);
  });
  it('forfeits release ownership and shutdown aborts without claiming a winner', () => {
    const session = create();
    ready(session);
    session.forfeit('p_teal', 10);
    expect(
      session.view('').state.players.find((p) => p.id === 'p_teal')?.eliminated,
    ).toBe(true);
    expect(
      session.view('').state.territories.some((t) => t.ownerId === 'p_teal'),
    ).toBe(false);
    session.abort(20);
    expect(session.view('').state.result).toMatchObject({
      reason: 'ABORTED',
      winners: [],
    });
  });
});
