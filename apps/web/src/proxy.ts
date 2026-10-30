import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readWebAuthConfig } from './features/content/server-config';
import { sessionClient } from './features/content/server-session';
import { sameOrigin } from './features/content/server-policy';

export async function proxy(request: NextRequest) {
  const settings = readWebAuthConfig(process.env);
  let response = NextResponse.next({ request });
  if (
    settings &&
    request.method === 'POST' &&
    !sameOrigin(request, settings.origin)
  )
    return NextResponse.json(
      { error: 'ORIGIN_NOT_ALLOWED' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    );
  if (settings) {
    const client = sessionClient(settings, {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values)
          response.cookies.set(name, value, options);
      },
    });
    try {
      await client.auth.getUser();
    } catch {
      /* Route handlers fail closed; no provider error is reflected. */
    }
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}
export const config = {
  matcher: [
    '/signin',
    '/admin/:path*',
    '/api/auth/:path*',
    '/api/content/:path*',
  ],
};
