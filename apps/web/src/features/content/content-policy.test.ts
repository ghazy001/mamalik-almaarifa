import { describe, expect, it } from 'vitest';
import { readWebAuthConfig } from './server-config';
import { createSignInBudget, sameOrigin } from './server-policy';
import { contentCommandSchema, detailSchema } from './contracts';
describe('web content boundary', () => {
  const env = {
    WEB_AUTH_ENABLED: 'true',
    WEB_AUTH_ORIGIN: 'http://127.0.0.1:3101',
    SUPABASE_URL: 'http://127.0.0.1:49001',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_fixture_only_123456789',
    CONTENT_ADMIN_URL: 'http://127.0.0.1:2574',
  };
  it('disables incomplete configuration and restricts upstream origins', () => {
    expect(readWebAuthConfig({})).toBeNull();
    expect(
      readWebAuthConfig({ ...env, CONTENT_ADMIN_URL: undefined }),
    ).toBeNull();
    expect(readWebAuthConfig(env)?.origin).toBe(env.WEB_AUTH_ORIGIN);
    for (const url of [
      'http://remote.example',
      'https://user:password@example.org',
      'https://example.org/path',
      'https://example.org?redirect=evil',
      'invalid',
    ])
      expect(readWebAuthConfig({ ...env, CONTENT_ADMIN_URL: url })).toBeNull();
    expect(
      readWebAuthConfig({ ...env, WEB_AUTH_ORIGIN: 'https://app.example' }),
    ).toBeNull();
  });
  it('requires exact same origin and JSON on cookie-authenticated writes', () => {
    const request = (headers: Record<string, string>) =>
      new Request(`${env.WEB_AUTH_ORIGIN}/api/auth/signin`, {
        method: 'POST',
        headers,
      });
    expect(
      sameOrigin(
        request({
          origin: env.WEB_AUTH_ORIGIN,
          'content-type': 'application/json',
        }),
        env.WEB_AUTH_ORIGIN,
      ),
    ).toBe(true);
    for (const headers of [
      {
        origin: 'https://untrusted.example',
        'content-type': 'application/json',
      },
      { 'content-type': 'application/json' },
      { origin: env.WEB_AUTH_ORIGIN, 'content-type': 'text/plain' },
      {
        origin: env.WEB_AUTH_ORIGIN,
        'content-type': 'application/json',
        'sec-fetch-site': 'cross-site',
      },
    ])
      expect(sameOrigin(request(headers), env.WEB_AUTH_ORIGIN)).toBe(false);
  });
  it('bounds sign-in attempts/concurrency and releases each slot once', () => {
    const budget = createSignInBudget();
    const slots = Array.from({ length: 4 }, () => budget(10));
    expect(slots.every(Boolean)).toBe(true);
    expect(budget(10)).toBeNull();
    for (const slot of slots) {
      slot?.();
      slot?.();
    }
    for (let index = 0; index < 25; index++) budget(10)?.();
    expect(budget(10)).toBeNull();
    expect(budget(60011)).not.toBeNull();
  });
  it('rejects actor injection and malformed revision commands', () => {
    expect(
      contentCommandSchema.safeParse({
        type: 'PUBLISH',
        questionId: '00000000-0000-4000-8000-000000000001',
        revision: 1,
        actor: 'publisher',
      }).success,
    ).toBe(false);
    expect(
      contentCommandSchema.safeParse({
        type: 'PUBLISH',
        questionId: 'bad',
        revision: 0,
      }).success,
    ).toBe(false);
    expect(detailSchema.safeParse({ correctChoiceId: 'leak' }).success).toBe(
      false,
    );
  });
});
