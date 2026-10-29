import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION } from '@mamalik/shared';
import type { Request, Response } from 'express';
import { kingdomRoom } from './kingdom-room.js';
import type { RoomSettings } from './kingdom-room.js';

/** Persistent private-room service. Settings are server-injected, not client options. */
export function createGameService(settings: RoomSettings = {}) {
  const service = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport({
      maxPayload: 4096,
      perMessageDeflate: false,
    }),
    express: (app) => {
      app.disable('x-powered-by');
      app.get('/health', (_request: Request, response: Response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.json({
          status: 'ok',
          service: 'mamalik-game-server',
          milestone: 'M3',
          protocolVersion: PROTOCOL_VERSION,
          gameplayRoomsEnabled: true,
        });
      });
    },
  });
  service.define('kingdom', kingdomRoom(settings));
  return service;
}
