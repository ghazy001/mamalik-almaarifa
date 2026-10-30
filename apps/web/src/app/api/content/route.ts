import { z } from 'zod';
import {
  contentCommandSchema,
  detailSchema,
  listSchema,
  meSchema,
} from '../../../features/content/contracts';
import {
  contentFetch,
  privateJson,
  readBoundedJson,
  routeSession,
  sameOrigin,
  serverToken,
} from '../../../features/content/server-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function project(response: Response, schema?: z.ZodType) {
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = z
      .object({ error: z.string().regex(/^[A-Z_]+$/) })
      .safeParse(value);
    return privateJson(
      { error: error.success ? error.data.error : 'CONTENT_UNAVAILABLE' },
      response.status,
    );
  }
  return privateJson(
    schema
      ? schema.parse(value)
      : z
          .union([
            z.strictObject({ accepted: z.literal(true) }),
            z.strictObject({
              questionId: z.uuid(),
              revision: z.number().int().positive(),
              created: z.boolean().optional(),
            }),
          ])
          .parse(value),
    response.status,
  );
}
export async function GET(request: Request) {
  try {
    const session = await serverToken();
    if (!session) return privateJson({ error: 'UNAUTHENTICATED' }, 401);
    const query = z
      .strictObject({
        view: z.enum(['me', 'list', 'detail']),
        id: z.uuid().optional(),
        revision: z.coerce.number().int().positive().optional(),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const path =
      query.view === 'me'
        ? '/me'
        : query.view === 'list'
          ? `/questions?limit=25&offset=${query.offset}`
          : query.id && query.revision
            ? `/questions/${query.id}/revisions/${query.revision}`
            : null;
    if (!path) return privateJson({ error: 'INVALID_INPUT' }, 400);
    return await project(
      await contentFetch(path, session.token, session.config.contentUrl),
      query.view === 'me'
        ? meSchema
        : query.view === 'list'
          ? listSchema
          : detailSchema,
    );
  } catch (error) {
    return privateJson(
      {
        error:
          error instanceof z.ZodError ? 'INVALID_INPUT' : 'CONTENT_UNAVAILABLE',
      },
      error instanceof z.ZodError ? 400 : 503,
    );
  }
}
export async function POST(request: Request) {
  const session = await routeSession();
  if (!session) return privateJson({ error: 'AUTH_DISABLED' }, 503);
  if (!sameOrigin(request, session.config.origin))
    return privateJson({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  try {
    const command = contentCommandSchema.parse(await readBoundedJson(request));
    const key = z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .parse(request.headers.get('idempotency-key'));
    const { data } = await session.client.auth.getSession();
    if (!data.session) return privateJson({ error: 'UNAUTHENTICATED' }, 401);
    return await project(
      await contentFetch(
        '/commands',
        data.session.access_token,
        session.config.contentUrl,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: JSON.stringify(command),
        },
      ),
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'BODY_TOO_LARGE')
      return privateJson({ error: 'BODY_TOO_LARGE' }, 413);
    return privateJson(
      {
        error:
          error instanceof z.ZodError || error instanceof SyntaxError
            ? 'INVALID_INPUT'
            : 'CONTENT_UNAVAILABLE',
      },
      error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503,
    );
  }
}
