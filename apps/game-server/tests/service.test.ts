import { afterAll, describe, expect, it } from 'vitest';
import { createMatch } from '@mamalik/game-core';
import { processIntent, snapshot } from '../src/commands.js';
import { readConfig } from '../src/config.js';
import { createGameService } from '../src/server.js';

const initial = () =>
  createMatch({
    id: 'm_test',
    players: [
      { id: 'p1', name: 'أ' },
      { id: 'p2', name: 'ب' },
      { id: 'p3', name: 'ج' },
    ],
    seed: 1,
    questionIds: Array.from({ length: 36 }, (_, i) => `q${i}`),
  });
describe('server boundary', () => {
  it('validates local defaults and rejects invalid startup settings', () => {
    expect(readConfig({}).GAME_SERVER_PORT).toBe(2567);
    for (const GAME_SERVER_PORT of ['0', '65536', 'abc', '1.5'])
      expect(() => readConfig({ GAME_SERVER_PORT })).toThrow();
    expect(() => readConfig({ NODE_ENV: 'unknown' })).toThrow();
  });
  it('derives identity from transport; rejects actor injection without mutation', () => {
    const state = initial();
    const command = {
      protocolVersion: 1,
      type: 'READY',
      matchId: state.id,
      turn: 0,
      idempotencyKey: 'r1',
    };
    const accepted = processIntent(state, command, 'p2', { now: 10 });
    expect(accepted.ok).toBe(true);
    expect(accepted.state.players.find((p) => p.id === 'p2')?.ready).toBe(true);
    const injected = processIntent(state, { ...command, actor: 'p1' }, 'p2', {
      now: 10,
    });
    expect(injected).toMatchObject({ ok: false, error: 'MALFORMED_COMMAND' });
    expect(injected.state).toBe(state);
    expect(
      processIntent(state, command, 'outsider', { now: 10 }),
    ).toMatchObject({ ok: false, error: 'INVALID_ACTOR' });
  });
  it('does not pretend reconnect is implemented; validates public snapshots', () => {
    const state = initial();
    expect(
      processIntent(
        state,
        {
          protocolVersion: 1,
          type: 'REQUEST_RECONNECT',
          matchId: state.id,
          turn: 0,
          idempotencyKey: 're',
        },
        'p1',
        { now: 10 },
      ),
    ).toMatchObject({ ok: false, error: 'NOT_IMPLEMENTED' });
    expect(snapshot(state).territories).toHaveLength(15);
    expect(JSON.stringify(snapshot(state))).not.toContain('questionDeck');
  });
});

describe('standalone Colyseus health service', () => {
  const service = createGameService();
  afterAll(async () => {
    await service.gracefullyShutdown(false);
  });
  it('boots on an ephemeral port and serves an honest health response', async () => {
    await service.listen(0, '127.0.0.1');
    const address = service.transport.server?.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing HTTP address');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'mamalik-game-server',
      milestone: 'M3',
      protocolVersion: 1,
      gameplayRoomsEnabled: true,
    });
  });
});
