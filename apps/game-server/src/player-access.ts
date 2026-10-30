import { randomBytes } from 'node:crypto';
import express from 'express';
import type { Application } from 'express';
import { ServerError } from '@colyseus/core';
import { contentIdentitySchema } from '@mamalik/database';
import type { ContentIdentity } from '@mamalik/database';
import { ContentHttpError } from './content-auth.js';

/** Process-local, single-use admission credentials. Never carries a provider JWT. */
export function createPlayerAccess(
  authenticate: (header: string | undefined) => Promise<ContentIdentity>,
  now: () => number = () => performance.now(),
) {
  const tickets = new Map<
    string,
    { identity: ContentIdentity; expires: number }
  >();
  let pending = 0;
  function prune() {
    for (const [key, ticket] of tickets)
      if (ticket.expires <= now()) tickets.delete(key);
  }
  return {
    async issue(header: string | undefined) {
      prune();
      if (pending >= 8 || tickets.size >= 256)
        throw new ContentHttpError(503, 'PLAYER_AUTH_UNAVAILABLE');
      pending++;
      try {
        const identity = contentIdentitySchema.parse(
          await authenticate(header),
        );
        prune();
        if (tickets.size >= 256)
          throw new ContentHttpError(503, 'PLAYER_AUTH_UNAVAILABLE');
        const ticket = randomBytes(32).toString('hex');
        tickets.set(ticket, { identity, expires: now() + 30000 });
        return { ticket };
      } finally {
        pending--;
      }
    },
    consume(ticket: string) {
      const record = tickets.get(ticket);
      tickets.delete(ticket);
      if (!record || record.expires <= now())
        throw new ServerError(401, 'PLAYER_TICKET_INVALID');
      return structuredClone(record.identity);
    },
  };
}
export type PlayerAccess = ReturnType<typeof createPlayerAccess>;

export function installPlayerAccess(app: Application, access?: PlayerAccess) {
  const router = express.Router();
  app.use('/player', router);
  const buckets = new Map<string, { start: number; count: number }>();
  router.use((request, response, next) => {
    response.set({
      'Cache-Control': 'private, no-store',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.removeHeader('Access-Control-Allow-Origin');
    if (!access) {
      response.status(404).json({ error: 'PLAYER_AUTH_DISABLED' });
      return;
    }
    if (request.headers.origin) {
      response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
      return;
    }
    const now = performance.now();
    for (const [key, value] of buckets)
      if (now - value.start >= 60000) buckets.delete(key);
    const key = request.socket.remoteAddress ?? 'unknown';
    const bucket = buckets.get(key) ?? { start: now, count: 0 };
    if (++bucket.count > 60 || (!buckets.has(key) && buckets.size >= 2048)) {
      response.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }
    buckets.set(key, bucket);
    next();
  });
  router.post(
    '/ticket',
    express.json({ limit: '2kb' }),
    async (request, response) => {
      if (
        !request.is('application/json') ||
        !request.body ||
        Object.keys(request.body).length ||
        Array.isArray(request.body)
      ) {
        response.status(400).json({ error: 'INVALID_INPUT' });
        return;
      }
      try {
        response.json(await access!.issue(request.headers.authorization));
      } catch (error) {
        response
          .status(error instanceof ContentHttpError ? error.status : 503)
          .json({
            error:
              error instanceof ContentHttpError && error.status === 401
                ? 'UNAUTHENTICATED'
                : 'PLAYER_AUTH_UNAVAILABLE',
          });
      }
    },
  );
  router.use(
    (
      _error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next; // Express requires four parameters to recognize error middleware.
      response.status(400).json({ error: 'INVALID_INPUT' });
    },
  );
}
