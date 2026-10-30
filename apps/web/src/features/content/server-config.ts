import { z } from 'zod';

function baseUrl(value: string) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) &&
    url.pathname === '/' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
}
const url = z
  .url()
  .refine(baseUrl)
  .transform((value) => new URL(value).origin);
const configSchema = z.object({
  WEB_AUTH_ORIGIN: url,
  SUPABASE_URL: url,
  CONTENT_ADMIN_URL: url,
  SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .regex(/^sb_publishable_[A-Za-z0-9_-]{16,200}$/),
});
export function readWebAuthConfig(env: Record<string, string | undefined>) {
  if (env.WEB_AUTH_ENABLED !== 'true') return null;
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) return null;
  const config = parsed.data;
  if (
    new URL(config.WEB_AUTH_ORIGIN).protocol === 'https:' &&
    new URL(config.SUPABASE_URL).protocol !== 'https:'
  )
    return null;
  return {
    origin: config.WEB_AUTH_ORIGIN,
    supabaseUrl: config.SUPABASE_URL,
    key: config.SUPABASE_PUBLISHABLE_KEY,
    contentUrl: config.CONTENT_ADMIN_URL,
    secure: config.WEB_AUTH_ORIGIN.startsWith('https:'),
  };
}
export type WebAuthConfig = NonNullable<ReturnType<typeof readWebAuthConfig>>;
