import { PROTOCOL_VERSION } from '@mamalik/shared';
import { matchArchiveSchema } from '@mamalik/database';
import { createServerMatch } from '../../src/match-session.js';

export function finishedArchive() {
  const session = createServerMatch({
    id: 'm_result_fixture',
    seed: 2026,
    rules: { maxTurns: 1 },
    players: ['p_teal', 'p_blue', 'p_gold'].map((id) => ({
      id,
      name: 'guest-name-canary',
    })),
  });
  for (const player of session.publicState().players)
    session.command(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'READY',
        matchId: 'm_result_fixture',
        turn: 0,
        idempotencyKey: 'ready',
      },
      player.id,
      0,
    );
  session.tick(10000);
  return matchArchiveSchema.parse({
    ...session.archive(),
    mode: 'private',
    questionSource: 'development',
  });
}
