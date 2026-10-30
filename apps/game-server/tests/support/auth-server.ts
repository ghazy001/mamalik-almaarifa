import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';

// Test-only Supabase /user fixture. Real signatures; never installed by server startup.
export async function startAuthFixture() {
  const keys = await generateKeyPair('ES256', { extractable: true });
  const revoked = new Set<string>();
  let issuer = '';
  const key = 'sb_publishable_local_fixture_only_123456789';
  let calls = 0;
  const server = createServer(async (request, response) => {
    calls++;
    response.setHeader('Content-Type', 'application/json');
    try {
      if (request.url !== '/auth/v1/user' || request.headers.apikey !== key)
        throw new Error('Invalid request');
      const token = request.headers.authorization?.replace(/^Bearer /, '');
      if (!token) throw new Error('Missing JWT');
      const { payload } = await jwtVerify(token, keys.publicKey, {
        algorithms: ['ES256'],
        issuer,
        audience: 'authenticated',
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      if (
        !payload.sub ||
        payload.role !== 'authenticated' ||
        revoked.has(payload.sub)
      )
        throw new Error('Invalid user');
      response.end(
        JSON.stringify({
          id: payload.sub,
          role: 'authenticated',
          is_anonymous: payload.is_anonymous === true,
          user_metadata: payload.user_metadata ?? {},
          app_metadata: payload.app_metadata ?? {},
        }),
      );
    } catch {
      response.statusCode = 401;
      response.end(JSON.stringify({ msg: 'Invalid user', code: 'bad_jwt' }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
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
    publicKey: () => exportJWK(keys.publicKey),
    async token(
      subject: string,
      options: {
        issuer?: string;
        audience?: string;
        expired?: boolean;
        anonymous?: boolean;
        forgedRoles?: boolean;
        wrongKey?: boolean;
      } = {},
    ) {
      const signingKey = options.wrongKey
        ? (await generateKeyPair('ES256')).privateKey
        : keys.privateKey;
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        role: 'authenticated',
        is_anonymous: options.anonymous ?? false,
        ...(options.forgedRoles
          ? {
              user_metadata: { role: 'publisher' },
              app_metadata: { roles: ['publisher'] },
            }
          : {}),
      })
        .setProtectedHeader({ alg: 'ES256' })
        .setSubject(subject)
        .setIssuer(options.issuer ?? issuer)
        .setAudience(options.audience ?? 'authenticated')
        .setIssuedAt(now - 60)
        .setExpirationTime(options.expired ? now - 30 : now + 300)
        .sign(signingKey);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
