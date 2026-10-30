import { expect, it } from 'vitest';
import { createPlayerAccess } from '../src/player-access.js';
import { readConfig } from '../src/config.js';
const identity = {
  issuer: 'http://127.0.0.1:49001/auth/v1',
  subject: '00000000-0000-4000-8000-000000000001',
};
it('consumes a detached ticket exactly once and rejects expired or forged tickets', async () => {
  let now = 100;
  const access = createPlayerAccess(
    async () => identity,
    () => now,
  );
  const first = await access.issue('Bearer fixture');
  expect(first.ticket).toMatch(/^[a-f0-9]{64}$/);
  expect(access.consume(first.ticket)).toEqual(identity);
  expect(() => access.consume(first.ticket)).toThrow('PLAYER_TICKET_INVALID');
  expect(() => access.consume('a'.repeat(64))).toThrow('PLAYER_TICKET_INVALID');
  const expired = await access.issue('Bearer fixture');
  now += 30000;
  expect(() => access.consume(expired.ticket)).toThrow('PLAYER_TICKET_INVALID');
});
it('bounds provider work and unused credentials without timing sleeps', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const access = createPlayerAccess(
    async () => {
      await gate;
      return identity;
    },
    () => 0,
  );
  const pending = Array.from({ length: 8 }, () =>
    access.issue('Bearer fixture'),
  );
  await expect(access.issue('Bearer fixture')).rejects.toMatchObject({
    status: 503,
  });
  release();
  await Promise.all(pending);
  for (let index = 8; index < 256; index++)
    await access.issue('Bearer fixture');
  await expect(access.issue('Bearer fixture')).rejects.toMatchObject({
    status: 503,
  });
});
it('requires explicit results, project and Auth configuration for player admission', () => {
  expect(readConfig({}).PLAYER_AUTH_ENABLED).toBe(false);
  expect(() => readConfig({ PLAYER_AUTH_ENABLED: 'true' })).toThrow();
  const config = {
    PLAYER_AUTH_ENABLED: 'true',
    MATCH_RESULTS_ENABLED: 'true',
    DATABASE_URL: 'postgresql://localhost/fixture',
    SUPABASE_URL: 'http://127.0.0.1:49001',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture_only_123456789',
  };
  expect(readConfig(config)).toMatchObject({
    PLAYER_AUTH_ENABLED: true,
    CONTENT_ADMIN_ENABLED: false,
  });
  expect(() => readConfig({ ...config, NODE_ENV: 'production' })).toThrow();
});
