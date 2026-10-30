import { createClient } from '@supabase/supabase-js';
import type { ContentIdentity } from '@mamalik/database';
import { z } from 'zod';

export class ContentHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
const userSchema = z.object({
  id: z.uuid(),
  role: z.literal('authenticated'),
  is_anonymous: z.literal(false),
});

export function createContentAuthenticator(
  url: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch,
) {
  const issuer = `${url}/auth/v1`;
  const client = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, options) =>
        fetcher(input, {
          ...options,
          redirect: 'error',
          signal: AbortSignal.timeout(3000),
        }),
    },
  });
  return async (
    authorization: string | undefined,
  ): Promise<ContentIdentity> => {
    // Tokens are accepted only in this header, never cookies/query/body.
    const match = authorization?.match(
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
    );
    if (!match || authorization!.length > 8192)
      throw new ContentHttpError(401, 'UNAUTHENTICATED');
    try {
      // Explicit JWT: no shared user's session or refresh token is ever installed.
      const { data, error } = await client.auth.getUser(match[1]!);
      if (error) {
        if (
          error.status === 0 ||
          (error.status ?? 0) >= 500 ||
          error.status === 429
        )
          throw new ContentHttpError(503, 'AUTH_UNAVAILABLE');
        throw new ContentHttpError(401, 'UNAUTHENTICATED');
      }
      const result = userSchema.safeParse(data.user);
      if (!result.success) throw new ContentHttpError(401, 'UNAUTHENTICATED');
      // Profile/user/app metadata never grants application permissions.
      return { issuer, subject: result.data.id.toLowerCase() };
    } catch (error) {
      if (error instanceof ContentHttpError) throw error;
      throw new ContentHttpError(503, 'AUTH_UNAVAILABLE');
    }
  };
}
