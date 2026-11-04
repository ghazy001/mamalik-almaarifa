import { afterAll, expect, it } from 'vitest';
import { createGameService } from '../src/server.js';
import { createPlayerAccess } from '../src/player-access.js';
import { ContentHttpError } from '../src/content-auth.js';
let release!: () => void,
  gate = Promise.resolve(),
  reads = 0,
  corrupt = false;
const value = {
  policyVersion: 'basic-v1' as const,
  points: 0,
  position: null,
  eligibleMatches: 0,
  soleWins: 0,
  sharedWins: 0,
};
const service = createGameService(
  {
    playerAccess: createPlayerAccess(async (header) => {
      if (header !== 'Bearer fixture')
        throw new ContentHttpError(401, 'UNAUTHENTICATED');
      return {
        issuer: 'https://fixture.example/auth/v1',
        subject: '00000000-0000-4000-8000-000000000001',
      };
    }),
  },
  undefined,
  async () => {
    reads++;
    await gate;
    return { items: [], nextCursor: null };
  },
  async () => {
    reads++;
    await gate;
    return corrupt ? { ...value, subject: 'private' } : value;
  },
);
let base = '';
afterAll(async () => {
  release?.();
  await service.gracefullyShutdown(false);
});
it('shares the eight-read budget with history and recovers after all reads settle', async () => {
  await service.listen(0, '127.0.0.1');
  const address = service.transport.server!.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  base = `http://127.0.0.1:${address.port}/player`;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = Array.from({ length: 9 }, (_, i) =>
    fetch(`${base}/${i % 2 ? 'history' : 'standing'}`, {
      headers: { Authorization: 'Bearer fixture' },
    }),
  );
  expect((await Promise.race(pending)).status).toBe(503);
  expect(reads).toBe(8);
  release();
  gate = Promise.resolve();
  expect(
    (await Promise.all(pending)).filter((row) => row.status === 200),
  ).toHaveLength(8);
});
it('fails closed on unexpected private output fields and returns a clean response on recovery', async () => {
  corrupt = true;
  const bad = await fetch(`${base}/standing`, {
    headers: { Authorization: 'Bearer fixture' },
  });
  expect(bad.status).toBe(503);
  expect(await bad.text()).toBe('{"error":"STANDING_UNAVAILABLE"}');
  corrupt = false;
  expect(
    await (
      await fetch(`${base}/standing`, {
        headers: { Authorization: 'Bearer fixture' },
      })
    ).json(),
  ).toEqual(value);
});
