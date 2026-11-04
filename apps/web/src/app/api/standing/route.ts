import { standingQuerySchema, personalStandingSchema } from '@mamalik/shared';
import {
  privateJson,
  routeSession,
} from '../../../features/content/server-http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (process.env.WEB_PLAYER_AUTH_ENABLED !== 'true')
    return privateJson({ error: 'STANDING_DISABLED' }, 404);
  const session = await routeSession();
  if (!session) return privateJson({ error: 'STANDING_DISABLED' }, 503);
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== session.config.origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return privateJson({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  const parameters = new URL(request.url).searchParams;
  const query = standingQuerySchema.safeParse(Object.fromEntries(parameters));
  if (
    !query.success ||
    [...parameters.keys()].length !== new Set(parameters.keys()).size
  )
    return privateJson({ error: 'INVALID_STANDING_QUERY' }, 400);
  try {
    const { data } = await session.client.auth.getSession();
    if (!data.session) return privateJson({ error: 'UNAUTHENTICATED' }, 401);
    const upstream = await fetch(
      `${session.config.contentUrl}/player/standing`,
      {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      },
    );
    if (!upstream.ok) {
      const status =
        upstream.status === 401 ? 401 : upstream.status === 400 ? 400 : 503;
      return privateJson(
        {
          error:
            status === 401
              ? 'UNAUTHENTICATED'
              : status === 400
                ? 'INVALID_STANDING_QUERY'
                : 'STANDING_UNAVAILABLE',
        },
        status,
      );
    }
    return privateJson(personalStandingSchema.parse(await upstream.json()));
  } catch {
    return privateJson({ error: 'STANDING_UNAVAILABLE' }, 503);
  }
}
