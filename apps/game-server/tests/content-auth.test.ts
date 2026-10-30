import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createContentAuthenticator } from '../src/content-auth.js';
import { readConfig } from '../src/config.js';
import { startAuthFixture } from './support/auth-server.js';

let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
beforeAll(async () => {
  fixture = await startAuthFixture();
});
afterAll(async () => {
  await fixture.close();
});
describe('Supabase server identity boundary', () => {
  it('requires full opt-in configuration and rejects unsafe Auth endpoints/keys', () => {
    expect(readConfig({}).CONTENT_ADMIN_ENABLED).toBe(false);
    expect(() => readConfig({ CONTENT_ADMIN_ENABLED: 'true' })).toThrow();
    const env = {
      CONTENT_ADMIN_ENABLED: 'true',
      SUPABASE_URL: fixture.url,
      SUPABASE_PUBLISHABLE_KEY: fixture.key,
      DATABASE_URL: 'postgresql://localhost/test',
    };
    expect(readConfig(env).SUPABASE_URL).toBe(fixture.url);
    for (const SUPABASE_URL of [
      'http://example.org',
      'https://example.org/path',
      'https://user:secret@example.org',
      'invalid',
    ])
      expect(() => readConfig({ ...env, SUPABASE_URL })).toThrow();
    expect(() => readConfig({ ...env, NODE_ENV: 'production' })).toThrow();
    expect(() =>
      readConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do_not_use' }),
    ).toThrow();
  });
  it('returns only verified subject/issuer and never trusts profile roles', async () => {
    const subject = randomUUID();
    const authenticate = createContentAuthenticator(fixture.url, fixture.key);
    expect(
      await authenticate(
        `Bearer ${await fixture.token(subject, { forgedRoles: true })}`,
      ),
    ).toEqual({ subject, issuer: fixture.issuer });
  });
  it.each([
    'missing',
    'malformed',
    'expired',
    'wrong-key',
    'wrong-issuer',
    'wrong-audience',
    'anonymous',
    'removed',
  ] as const)('rejects %s identities', async (kind) => {
    const subject = randomUUID();
    if (kind === 'removed') fixture.revoked.add(subject);
    const token = await fixture.token(subject, {
      expired: kind === 'expired',
      wrongKey: kind === 'wrong-key',
      issuer:
        kind === 'wrong-issuer'
          ? 'https://other.example/auth/v1'
          : fixture.issuer,
      audience: kind === 'wrong-audience' ? 'service_role' : 'authenticated',
      anonymous: kind === 'anonymous',
    });
    const header =
      kind === 'missing'
        ? undefined
        : kind === 'malformed'
          ? 'Bearer arbitrary'
          : `Bearer ${token}`;
    await expect(
      createContentAuthenticator(fixture.url, fixture.key)(header),
    ).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
  it('fails closed on unavailable Auth without reflecting credentials', async () => {
    const unavailable: typeof fetch = async () =>
      new Response(JSON.stringify({ msg: 'private-provider-detail' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    const token = await fixture.token(randomUUID());
    await expect(
      createContentAuthenticator(
        fixture.url,
        fixture.key,
        unavailable,
      )(`Bearer ${token}`),
    ).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_UNAVAILABLE',
      message: 'AUTH_UNAVAILABLE',
    });
  });
});
