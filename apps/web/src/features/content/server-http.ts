import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { readWebAuthConfig } from './server-config';
import { sessionClient } from './server-session';

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export { sameOrigin } from './server-policy';
export async function readBoundedJson(
  request: Request,
  limit = 16384,
): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > limit)
    throw new Error('BODY_TOO_LARGE');
  if (!request.body) throw new Error('INVALID_INPUT');
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
export async function routeSession() {
  const config = readWebAuthConfig(process.env);
  if (!config) return null;
  const store = await cookies();
  const client = sessionClient(config, {
    getAll: () => store.getAll(),
    setAll: (values) => {
      for (const { name, value, options } of values)
        store.set(name, value, options);
    },
  });
  return { config, client, store };
}
export async function serverToken() {
  const config = readWebAuthConfig(process.env);
  if (!config) return null;
  const store = await cookies();
  const client = sessionClient(config, {
    getAll: () => store.getAll(),
    setAll: () => {
      /* Proxy refreshes before a read-only server render. */
    },
  });
  const { data } = await client.auth.getSession();
  // This is credential extraction only. The game service verifies the token/user.
  return data.session ? { config, token: data.session.access_token } : null;
}
export async function contentFetch(
  path: string,
  token: string,
  base: string,
  options: RequestInit = {},
) {
  return fetch(`${base}/admin${path}`, {
    ...options,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
}
