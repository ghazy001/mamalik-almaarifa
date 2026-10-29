import { z } from 'zod';
const configSchema = z.object({
  GAME_SERVER_HOST: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9.:-]+$/)
    .default('127.0.0.1'),
  GAME_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});
export function readConfig(env: Record<string, string | undefined>) {
  return configSchema.parse(env);
}
export type Config = ReturnType<typeof readConfig>;
