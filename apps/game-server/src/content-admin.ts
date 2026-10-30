import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import {
  ContentAccessDenied,
  ContentRequestConflict,
  ContentError,
  contentActor,
  contentRequestKeySchema,
  createAccessRepository,
  questionContentSchema,
} from '@mamalik/database';
import type {
  ContentDatabase,
  ContentIdentity,
  ContentPermission,
} from '@mamalik/database';
import { z } from 'zod';
import { ContentHttpError } from './content-auth.js';

const revision = z.number().int().positive().max(2_147_483_647);
const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('CREATE_DRAFT'),
    content: questionContentSchema,
  }),
  z.strictObject({
    type: z.literal('REVISE'),
    questionId: z.uuid(),
    expectedRevision: revision,
    content: questionContentSchema,
  }),
  z.strictObject({
    type: z.literal('APPROVE'),
    questionId: z.uuid(),
    revision,
    note: z.string().trim().min(1).max(1000),
  }),
  z.strictObject({
    type: z.literal('PUBLISH'),
    questionId: z.uuid(),
    revision,
  }),
  z.strictObject({
    type: z.literal('RETIRE'),
    questionId: z.uuid(),
    revision,
    note: z.string().trim().min(1).max(1000),
  }),
]);
const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export interface ContentAdmin {
  db: ContentDatabase;
  authenticate: (authorization: string | undefined) => Promise<ContentIdentity>;
}

export function installContentAdmin(
  app: Application,
  settings: ContentAdmin | undefined,
) {
  const router = express.Router();
  app.use('/admin', router);
  const buckets = new Map<string, { started: number; count: number }>();
  let inFlight = 0;
  router.use(
    async (request: Request, response: Response, next: NextFunction) => {
      response.set({
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        Vary: 'Authorization',
        'X-Content-Type-Options': 'nosniff',
      });
      response.removeHeader('Access-Control-Allow-Origin');
      if (!settings) {
        response.status(404).json({ error: 'CONTENT_ADMIN_DISABLED' });
        return;
      }
      // This slice is a bearer-only server/CLI API. A future Next admin proxy is separate.
      if (request.headers.origin) {
        response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
        return;
      }
      const now = performance.now();
      for (const [key, bucket] of buckets)
        if (now - bucket.started >= 60_000) buckets.delete(key);
      const key = request.socket.remoteAddress ?? 'unknown';
      const bucket = buckets.get(key) ?? { started: now, count: 0 };
      if (
        ++bucket.count > 60 ||
        (!buckets.has(key) && buckets.size >= 2048) ||
        inFlight >= 8
      ) {
        response.setHeader('Retry-After', '60');
        response.status(429).json({ error: 'RATE_LIMITED' });
        return;
      }
      buckets.set(key, bucket);
      inFlight++;
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          inFlight--;
        }
      };
      response.once('finish', release);
      response.once('close', release);
      try {
        response.locals.contentIdentity = await settings.authenticate(
          request.headers.authorization,
        );
        next();
      } catch (error) {
        next(error);
      }
    },
  );
  const access = settings ? createAccessRepository(settings.db) : null;
  const identity = (response: Response) =>
    response.locals.contentIdentity as ContentIdentity;
  const run = (
    permission: ContentPermission,
    response: Response,
    work: Parameters<NonNullable<typeof access>['authorize']>[2],
  ) => access!.authorize(identity(response), permission, work);

  router.get('/me', async (_request, response) => {
    const who = identity(response);
    const roles = await access!.roles(who);
    response.json({
      subject: who.subject,
      issuer: who.issuer,
      actor: contentActor(who),
      roles,
    });
  });
  router.get('/questions', async (request, response) => {
    const query = querySchema.parse(request.query);
    response.json({
      items: await run('read', response, (questions) =>
        questions.list(query.limit, query.offset),
      ),
    });
  });
  router.get(
    '/questions/:id/revisions/:revision',
    async (request, response) => {
      const id = z.uuid().parse(request.params.id);
      const version = z.coerce
        .number()
        .pipe(revision)
        .parse(request.params.revision);
      response.json(
        await run('read', response, (questions) =>
          questions.getRevision(id, version),
        ),
      );
    },
  );
  router.post(
    '/commands',
    express.json({ limit: '16kb', strict: true, type: 'application/json' }),
    async (request, response) => {
      if (!request.is('application/json'))
        throw new ContentHttpError(415, 'JSON_REQUIRED');
      const command = commandSchema.parse(request.body);
      const permission =
        command.type === 'CREATE_DRAFT' || command.type === 'REVISE'
          ? 'edit'
          : command.type === 'APPROVE'
            ? 'review'
            : 'publish';
      const key = contentRequestKeySchema.parse(
        request.headers['idempotency-key'],
      );
      const result = await access!.command(
        identity(response),
        permission,
        key,
        command,
        async (questions, actor) => {
          switch (command.type) {
            case 'CREATE_DRAFT':
              return questions.createDraft(command.content, actor);
            case 'REVISE':
              return questions.revise(
                command.questionId,
                command.expectedRevision,
                command.content,
                actor,
              );
            case 'APPROVE':
              await questions.approve(
                command.questionId,
                command.revision,
                actor,
                command.note,
              );
              break;
            case 'PUBLISH':
              await questions.publish(
                command.questionId,
                command.revision,
                actor,
              );
              break;
            case 'RETIRE':
              await questions.retire(
                command.questionId,
                command.revision,
                actor,
                command.note,
              );
              break;
          }
          return { accepted: true };
        },
      );
      response.status(command.type === 'CREATE_DRAFT' ? 201 : 200).json(result);
    },
  );
  router.use((_request, response) => {
    response.status(404).json({ error: 'NOT_FOUND' });
  });
  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      void _next;
      if (error instanceof ContentHttpError) {
        if (error.status === 401)
          response.setHeader('WWW-Authenticate', 'Bearer');
        response.status(error.status).json({ error: error.code });
      } else if (error instanceof ContentAccessDenied)
        response.status(403).json({ error: 'FORBIDDEN' });
      else if (error instanceof ContentRequestConflict)
        response.status(409).json({ error: 'IDEMPOTENCY_CONFLICT' });
      else if (error instanceof z.ZodError)
        response.status(400).json({ error: 'INVALID_INPUT' });
      else if (error instanceof ContentError)
        response
          .status(error.code === 'NOT_FOUND' ? 404 : 409)
          .json({ error: error.code });
      else if (
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        error.type === 'entity.too.large'
      )
        response.status(413).json({ error: 'BODY_TOO_LARGE' });
      else if (error instanceof SyntaxError)
        response.status(400).json({ error: 'INVALID_JSON' });
      else response.status(503).json({ error: 'CONTENT_UNAVAILABLE' });
    },
  );
}
