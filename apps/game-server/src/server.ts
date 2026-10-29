import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION } from '@mamalik/shared';
import type { Request, Response } from 'express';

/** No registered game rooms in M1. HTTP health + persistent WS runtime only. */
export function createGameService() {
  return new Server({
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
          milestone: 'M1',
          protocolVersion: PROTOCOL_VERSION,
          gameplayRoomsEnabled: false,
        });
      });
    },
  });
}
