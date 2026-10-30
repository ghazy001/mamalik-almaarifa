import { z } from 'zod';
import { databaseUrlSchema } from '@mamalik/database';
const optionalValue = (schema: z.ZodType<string>) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );
const configSchema = z
  .object({
    GAME_SERVER_HOST: z
      .string()
      .min(1)
      .regex(/^[a-zA-Z0-9.:-]+$/)
      .default('127.0.0.1'),
    GAME_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(2567),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    CONTENT_ADMIN_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    GAME_QUESTION_SOURCE: z
      .enum(['development', 'published'])
      .default('development'),
    MATCH_RESULTS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SUPABASE_URL: optionalValue(
      z
        .url()
        .refine((value) => {
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
        })
        .transform((value) => new URL(value).origin),
    ),
    SUPABASE_PUBLISHABLE_KEY: optionalValue(
      z.string().regex(/^sb_publishable_[A-Za-z0-9_-]{16,200}$/),
    ),
    DATABASE_URL: optionalValue(databaseUrlSchema),
  })
  .superRefine((value, context) => {
    if (value.MATCH_RESULTS_ENABLED && !value.DATABASE_URL)
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Required for match results',
      });
    if (value.GAME_QUESTION_SOURCE === 'published' && !value.DATABASE_URL)
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Required for published room questions',
      });
    if (!value.CONTENT_ADMIN_ENABLED) return;
    for (const key of [
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'DATABASE_URL',
    ] as const)
      if (!value[key])
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Required when content administration is enabled',
        });
    if (
      value.NODE_ENV === 'production' &&
      value.SUPABASE_URL?.startsWith('http:')
    )
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_URL'],
        message: 'Production Auth requires HTTPS',
      });
  });
export function readConfig(env: Record<string, string | undefined>) {
  return configSchema.parse(env);
}
export type Config = ReturnType<typeof readConfig>;
