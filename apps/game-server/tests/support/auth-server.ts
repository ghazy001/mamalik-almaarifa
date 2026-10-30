import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';

export interface FixtureAccount {
  id: string;
  email: string;
  password: string;
}
interface TokenOptions {
  issuer?: string;
  audience?: string;
  expired?: boolean;
  anonymous?: boolean;
  forgedRoles?: boolean;
  wrongKey?: boolean;
  sessionId?: string;
}
// Test-only Supabase HTTP fixture. Ephemeral keys/accounts never enter production.
export async function startAuthFixture(
  options: { port?: number; accounts?: readonly FixtureAccount[] } = {},
) {
  const keys = await generateKeyPair('ES256', { extractable: true });
  const revoked = new Set<string>(),
    revokedSessions = new Set<string>();
  let issuer = '',
    calls = 0,
    refreshes = 0;
  const key = 'sb_publishable_local_fixture_only_123456789';
  type Session = {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    expires_at: number;
    user: ReturnType<typeof user>;
  };
  const refreshTokens = new Map<
    string,
    {
      subject: string;
      sessionId: string;
      usedAt: number | null;
      result: Promise<Session> | null;
    }
  >();
  async function token(subject: string, settings: TokenOptions = {}) {
    const signingKey = settings.wrongKey
      ? (await generateKeyPair('ES256')).privateKey
      : keys.privateKey;
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      role: 'authenticated',
      is_anonymous: settings.anonymous ?? false,
      ...(settings.sessionId ? { session_id: settings.sessionId } : {}),
      ...(settings.forgedRoles
        ? {
            user_metadata: { role: 'publisher' },
            app_metadata: { roles: ['publisher'] },
          }
        : {}),
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(subject)
      .setIssuer(settings.issuer ?? issuer)
      .setAudience(settings.audience ?? 'authenticated')
      .setIssuedAt(now - 60)
      .setExpirationTime(settings.expired ? now - 30 : now + 300)
      .sign(signingKey);
  }
  function user(subject: string) {
    return {
      id: subject,
      email:
        options.accounts?.find((account) => account.id === subject)?.email ??
        `${subject}@fixture.invalid`,
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: false,
      app_metadata: {},
      user_metadata: {},
    };
  }
  async function pair(
    subject: string,
    sessionId: string = randomUUID(),
  ): Promise<Session> {
    const refresh_token = randomBytes(24).toString('hex');
    const result = {
      access_token: await token(subject, { sessionId }),
      refresh_token,
      token_type: 'bearer',
      expires_in: 300,
      expires_at: Math.floor(Date.now() / 1000) + 300,
      user: user(subject),
    };
    refreshTokens.set(refresh_token, {
      subject,
      sessionId,
      usedAt: null,
      result: null,
    });
    return result;
  }
  const server = createServer(async (request, response) => {
    calls++;
    response.setHeader('Content-Type', 'application/json');
    try {
      if (request.headers.apikey !== key) throw new Error('Invalid key');
      const url = new URL(request.url ?? '/', 'http://fixture');
      if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 16384) throw new Error('Oversized body');
        }
        const input: unknown = JSON.parse(body);
        if (typeof input !== 'object' || input === null)
          throw new Error('Invalid body');
        if (url.searchParams.get('grant_type') === 'password') {
          const account = options.accounts?.find(
            (account) =>
              'email' in input &&
              'password' in input &&
              account.email === input.email &&
              account.password === input.password,
          );
          if (!account || revoked.has(account.id))
            throw new Error('Invalid credentials');
          response.end(JSON.stringify(await pair(account.id)));
          return;
        }
        if (
          url.searchParams.get('grant_type') === 'refresh_token' &&
          'refresh_token' in input &&
          typeof input.refresh_token === 'string'
        ) {
          const record = refreshTokens.get(input.refresh_token);
          if (
            !record ||
            revoked.has(record.subject) ||
            revokedSessions.has(record.sessionId)
          )
            throw new Error('Invalid refresh');
          if (
            record.result &&
            record.usedAt !== null &&
            Date.now() - record.usedAt < 10000
          ) {
            response.end(JSON.stringify(await record.result));
            return;
          }
          if (record.usedAt !== null) throw new Error('Reused refresh');
          refreshes++;
          record.usedAt = Date.now();
          // Concurrent refreshes share the same rotation, including while signing.
          record.result = pair(record.subject, record.sessionId);
          response.end(JSON.stringify(await record.result));
          return;
        }
        throw new Error('Invalid grant');
      }
      const raw = request.headers.authorization?.replace(/^Bearer /, '');
      if (!raw) throw new Error('Missing token');
      const { payload } = await jwtVerify(raw, keys.publicKey, {
        algorithms: ['ES256'],
        issuer,
        audience: 'authenticated',
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      if (
        !payload.sub ||
        payload.role !== 'authenticated' ||
        revoked.has(payload.sub) ||
        (typeof payload.session_id === 'string' &&
          revokedSessions.has(payload.session_id))
      )
        throw new Error('Invalid user');
      if (url.pathname === '/auth/v1/logout' && request.method === 'POST') {
        if (typeof payload.session_id === 'string')
          revokedSessions.add(payload.session_id);
        response.statusCode = 204;
        response.end();
        return;
      }
      if (url.pathname !== '/auth/v1/user') throw new Error('Invalid route');
      response.end(
        JSON.stringify({
          ...user(payload.sub),
          is_anonymous: payload.is_anonymous === true,
          user_metadata: payload.user_metadata ?? {},
          app_metadata: payload.app_metadata ?? {},
        }),
      );
    } catch {
      response.statusCode = 401;
      response.end(
        JSON.stringify({ msg: 'Invalid credentials', code: 'bad_jwt' }),
      );
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, '127.0.0.1', resolve),
  );
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No Auth address');
  const url = `http://127.0.0.1:${address.port}`;
  issuer = `${url}/auth/v1`;
  return {
    url,
    issuer,
    key,
    revoked,
    calls: () => calls,
    refreshes: () => refreshes,
    publicKey: () => exportJWK(keys.publicKey),
    token,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
