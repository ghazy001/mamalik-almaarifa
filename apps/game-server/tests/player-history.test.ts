import { afterAll, expect, it } from 'vitest';
import { createGameService } from '../src/server.js';
import { createPlayerAccess } from '../src/player-access.js';
import { ContentHttpError } from '../src/content-auth.js';
let release!: () => void;
let gate = Promise.resolve(),
  reads = 0,
  verifies = 0,
  corrupt = false;
const service = createGameService(
  {
    playerAccess: createPlayerAccess(async (header) => {
      verifies++;
      if (header !== 'Bearer fixture')
        throw new ContentHttpError(401, 'UNAUTHENTICATED');
      return {
        issuer: 'http://127.0.0.1:49001/auth/v1',
        subject: '00000000-0000-4000-8000-000000000001',
      };
    }),
  },
  undefined,
  async () => {
    reads++;
    await gate;
    return corrupt
      ? { items: [], nextCursor: null, seed: 1 }
      : { items: [], nextCursor: null };
  },
);
let base = '';
afterAll(async () => {
  release?.();
  await service.gracefullyShutdown(false);
});
it('bounds concurrent history reads before provider/database work', async () => {
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server!.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  base = `http://127.0.0.1:${address.port}/player/history`;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = Array.from({ length: 9 }, () =>
    fetch(base, { headers: { Authorization: 'Bearer fixture' } }),
  );
  const bounded = await Promise.race(pending);
  expect(bounded.status).toBe(503);
  expect(reads).toBe(8);
  expect(verifies).toBe(8);
  release();
  gate = Promise.resolve();
  const responses = await Promise.all(pending);
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    8,
  );
});
it('validates the allowlisted public projection and recovers without exposing private fields', async () => {
  corrupt = true;
  const bad = await fetch(base, {
    headers: { Authorization: 'Bearer fixture' },
  });
  expect(bad.status).toBe(503);
  expect(await bad.text()).toBe('{"error":"HISTORY_UNAVAILABLE"}');
  corrupt = false;
  expect(
    (await fetch(base, { headers: { Authorization: 'Bearer fixture' } }))
      .status,
  ).toBe(200);
});
