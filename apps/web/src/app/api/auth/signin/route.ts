import { z } from 'zod';
import {
  privateJson,
  readBoundedJson,
  routeSession,
  sameOrigin,
} from '../../../../features/content/server-http';
import { createSignInBudget } from '../../../../features/content/server-policy';
const budget = createSignInBudget();
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const session = await routeSession();
  if (!session) return privateJson({ error: 'AUTH_DISABLED' }, 503);
  if (!sameOrigin(request, session.config.origin))
    return privateJson({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  const release = budget(performance.now());
  if (!release) return privateJson({ error: 'RATE_LIMITED' }, 429);
  try {
    const value = z
      .strictObject({
        email: z.email().max(254),
        password: z.string().min(1).max(256),
      })
      .parse(await readBoundedJson(request, 2048));
    const { data, error } = await session.client.auth.signInWithPassword(value);
    if (error || !data.session) {
      const unavailable = error && (!error.status || error.status >= 500);
      return privateJson(
        {
          error: unavailable
            ? 'AUTH_UNAVAILABLE'
            : error?.status === 429
              ? 'RATE_LIMITED'
              : 'INVALID_CREDENTIALS',
        },
        unavailable ? 503 : error?.status === 429 ? 429 : 401,
      );
    }
    return privateJson({ signedIn: true });
  } catch (error) {
    return privateJson(
      {
        error:
          error instanceof Error && error.message === 'BODY_TOO_LARGE'
            ? 'BODY_TOO_LARGE'
            : 'INVALID_INPUT',
      },
      error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400,
    );
  } finally {
    release();
  }
}
