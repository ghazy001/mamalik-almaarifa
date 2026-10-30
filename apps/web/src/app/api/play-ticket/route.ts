import { z } from 'zod';
import { roomTicketSchema } from '@mamalik/shared';
import {
  privateJson,
  readBoundedJson,
  routeSession,
  sameOrigin,
} from '../../../features/content/server-http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (process.env.WEB_PLAYER_AUTH_ENABLED !== 'true')
    return privateJson({ error: 'PLAYER_AUTH_DISABLED' }, 404);
  const session = await routeSession();
  if (!session) return privateJson({ error: 'PLAYER_AUTH_DISABLED' }, 503);
  if (!sameOrigin(request, session.config.origin))
    return privateJson({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  try {
    z.strictObject({}).parse(await readBoundedJson(request, 2048));
  } catch {
    return privateJson({ error: 'INVALID_INPUT' }, 400);
  }
  try {
    const { data } = await session.client.auth.getSession();
    if (!data.session) return privateJson({ error: 'UNAUTHENTICATED' }, 401);
    const response = await fetch(`${session.config.contentUrl}/player/ticket`, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok)
      return privateJson(
        {
          error:
            response.status === 401
              ? 'UNAUTHENTICATED'
              : 'PLAYER_AUTH_UNAVAILABLE',
        },
        response.status === 401 ? 401 : 503,
      );
    return privateJson(
      z.strictObject({ ticket: roomTicketSchema }).parse(await response.json()),
    );
  } catch {
    return privateJson({ error: 'PLAYER_AUTH_UNAVAILABLE' }, 503);
  }
}
