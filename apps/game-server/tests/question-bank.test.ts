import { describe, expect, it } from 'vitest';
import {
  createQuestionBank,
  developmentQuestionBank,
  publishedQuestionLoader,
} from '../src/question-bank.js';
import { createServerMatch } from '../src/match-session.js';
import { readConfig } from '../src/config.js';
import { PROTOCOL_VERSION } from '@mamalik/shared';

const entry = (id: string) => ({
  question: {
    id,
    text: 'سؤال خاص للخادم',
    choices: [
      { id: 'a', text: 'أول' },
      { id: 'b', text: 'ثان' },
      { id: 'c', text: 'ثالث' },
      { id: 'd', text: 'رابع' },
    ],
    correctChoiceId: 'b',
  },
  explanation: 'private-explanation-canary',
  source: {
    label: 'private-source-canary',
    url: 'https://example.org/reference',
  },
});
describe('private room question snapshots', () => {
  it('requires explicit published mode/database configuration without requiring editorial Auth', () => {
    expect(readConfig({}).GAME_QUESTION_SOURCE).toBe('development');
    expect(() => readConfig({ GAME_QUESTION_SOURCE: 'published' })).toThrow();
    expect(() => readConfig({ GAME_QUESTION_SOURCE: 'client' })).toThrow();
    expect(
      readConfig({
        GAME_QUESTION_SOURCE: 'published',
        DATABASE_URL: 'postgresql://localhost/test',
      }).CONTENT_ADMIN_ENABLED,
    ).toBe(false);
  });
  it('rejects undersized, duplicate or malformed banks without falling back', () => {
    expect(() => createQuestionBank([], 36)).toThrow(
      'CONTENT_BANK_INSUFFICIENT',
    );
    expect(() => createQuestionBank([entry('q1'), entry('q1')], 1)).toThrow(
      'CONTENT_BANK_INVALID',
    );
    expect(() =>
      createQuestionBank(
        [
          {
            ...entry('q1'),
            question: { ...entry('q1').question, correctChoiceId: 'missing' },
          },
        ],
        1,
      ),
    ).toThrow('CONTENT_BANK_INVALID');
    expect(() =>
      createQuestionBank(
        [{ ...entry('q1'), explanation: 'x'.repeat(1001) }],
        1,
      ),
    ).toThrow('CONTENT_BANK_INVALID');
    expect(() => developmentQuestionBank(37)).toThrow(
      'CONTENT_BANK_INSUFFICIENT',
    );
    expect(() =>
      createQuestionBank(
        Array.from({ length: 1001 }, (_, index) => entry(`q_${index}`)),
        36,
      ),
    ).toThrow('CONTENT_BANK_INVALID');
  });
  it('detaches input and lookup data and freezes deck IDs', () => {
    const original = entry('q1');
    const bank = createQuestionBank([original], 1);
    original.question.text = 'changed';
    const copy = bank.get('q1');
    copy.question.correctChoiceId = 'a';
    copy.source!.label = 'changed';
    expect(bank.get('q1')).toEqual(entry('q1'));
    expect(Object.isFrozen(bank.ids)).toBe(true);
    expect(() => bank.get('absent')).toThrow('CONTENT_BANK_INVALID');
  });
  it('sanitizes read failures and bounds pending loads with released slots after failure', async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<never>((_, fail) => {
      reject = fail;
    });
    const load = publishedQuestionLoader(() => pending);
    const waiting = Array.from({ length: 4 }, () => load(36));
    const all = Promise.allSettled(waiting);
    await expect(load(36)).rejects.toMatchObject({
      code: 503,
      message: 'CONTENT_BANK_UNAVAILABLE',
    });
    reject(new Error('private SQL / answer / password'));
    for (const result of await all) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({
          message: 'CONTENT_BANK_UNAVAILABLE',
        });
    }
    await expect(load(36)).rejects.toMatchObject({
      message: 'CONTENT_BANK_UNAVAILABLE',
    });
  });
  it('uses only the supplied bank, preserves answer privacy and deterministically replays a complete match', () => {
    const bank = createQuestionBank(
      Array.from({ length: 36 }, (_, i) => entry(`private_${i}`)),
      36,
    );
    function play() {
      const match = createServerMatch({
        id: 'm_private',
        seed: 2026,
        players: ['p_teal', 'p_blue', 'p_gold'].map((id) => ({ id, name: id })),
        bank,
      });
      let now = 0;
      const states: unknown[] = [];
      const used = new Set<string>();
      function send(actor: string, type: string, fields = {}) {
        const state = match.publicState();
        const result = match.command(
          {
            protocolVersion: PROTOCOL_VERSION,
            type,
            matchId: state.matchId,
            turn: state.turn,
            idempotencyKey: `${type}_${state.turn}`,
            ...fields,
          },
          actor,
          now++,
        );
        expect(result.ok).toBe(true);
      }
      for (const id of ['p_teal', 'p_blue', 'p_gold']) send(id, 'READY');
      for (let guard = 0; guard < 200 && !match.finished; guard++) {
        const state = match.publicState();
        const actor = state.activePlayerId!;
        if (state.phase === 'ATTACK_SELECTION')
          send(actor, 'SELECT_TARGET', {
            targetId: match.view(actor).legalTargetIds[0]!,
          });
        else if (state.phase === 'DUEL') {
          const view = match.view(actor);
          expect(JSON.stringify(view)).not.toMatch(
            /correctChoiceId|private-explanation-canary|private-source-canary|questionDeck/,
          );
          expect(view.reveal).toBeNull();
          const question = state.question!;
          expect(question.id.startsWith('private_')).toBe(true);
          expect(used.has(question.id)).toBe(false);
          used.add(question.id);
          for (const id of [question.attackerId, question.defenderId].filter(
            (id): id is string => !!id,
          ))
            send(id, 'SUBMIT_ANSWER', {
              questionId: question.id,
              choiceId: 'b',
            });
          expect(match.view(actor).reveal?.explanation).toBe(
            'private-explanation-canary',
          );
          expect(match.publicState().outcome?.correctChoiceId).toBe('b');
        } else {
          now += 3000;
          match.tick(now);
        }
        states.push(match.view('p_teal'));
      }
      expect(match.finished).toBe(true);
      expect(used.size).toBeGreaterThan(0);
      return states;
    }
    expect(play()).toEqual(play());
  });
});
