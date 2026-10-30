import {
  privateJson,
  routeSession,
  sameOrigin,
} from '../../../../features/content/server-http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const session = await routeSession();
  if (!session) return privateJson({ error: 'AUTH_DISABLED' }, 503);
  if (!sameOrigin(request, session.config.origin))
    return privateJson({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  try {
    await session.client.auth.signOut({ scope: 'local' });
  } catch {
    /* Clear this browser even if upstream sign-out is unavailable. */
  }
  for (const cookie of session.store.getAll())
    if (
      cookie.name.startsWith('mm-auth') ||
      cookie.name.startsWith('__Host-mm-auth')
    )
      session.store.set(cookie.name, '', {
        httpOnly: true,
        secure: session.config.secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
  return privateJson({ signedOut: true });
}
