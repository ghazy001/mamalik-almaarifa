import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION } from '@mamalik/shared';
import type { Request, Response } from 'express';
import { kingdomRoom } from './kingdom-room.js';
import type { RoomSettings } from './kingdom-room.js';
import { installContentAdmin } from './content-admin.js';
import type { ContentAdmin } from './content-admin.js';

/** Persistent guest rooms. Settings/modes are server-injected, not client options. */
export function createGameService(
  settings: RoomSettings = {},
  contentAdmin?: ContentAdmin,
) {
  const service = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport({
      maxPayload: 4096,
      perMessageDeflate: false,
    }),
    express: (app) => {
      app.disable('x-powered-by');
      installContentAdmin(app, contentAdmin);
      app.get('/health', (_request: Request, response: Response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.json({
          status: 'ok',
          service: 'mamalik-game-server',
          milestone: 'M4',
          protocolVersion: PROTOCOL_VERSION,
          gameplayRoomsEnabled: true,
          contentAdminEnabled: Boolean(contentAdmin),
          questionSource: settings.loadQuestions ? 'published' : 'development',
          matchResultsEnabled: Boolean(settings.resultWriter),
        });
      });
    },
  });
  service.define('kingdom', kingdomRoom(settings));
  service
    .define('kingdom_queue', kingdomRoom(settings, 'matchmaking'))
    .sortBy({ clients: -1 });
  return service;
}
