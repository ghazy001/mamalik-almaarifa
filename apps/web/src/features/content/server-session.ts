import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import type { WebAuthConfig } from './server-config';

export interface SessionCookies {
  getAll(): { name: string; value: string }[];
  setAll(
    values: { name: string; value: string; options: CookieOptions }[],
  ): void;
}
export function sessionClient(config: WebAuthConfig, cookies: SessionCookies) {
  return createServerClient(config.supabaseUrl, config.key, {
    cookieOptions: {
      name: config.secure ? '__Host-mm-auth' : 'mm-auth',
      httpOnly: true,
      secure: config.secure,
      sameSite: 'lax',
      path: '/',
    },
    cookies,
    global: {
      fetch: (input, options) =>
        fetch(input, {
          ...options,
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        }),
    },
  });
}
