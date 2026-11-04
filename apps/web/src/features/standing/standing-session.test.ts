import { expect, it, vi } from 'vitest';
import { createStandingSession } from './standing-session';
const value = {
  policyVersion: 'basic-v1',
  points: 3,
  position: 1,
  eligibleMatches: 1,
  soleWins: 1,
  sharedWins: 0,
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
it('clears old data immediately and revalidates after errors or account sign-out', async () => {
  const request = vi.fn().mockImplementation(async () => reply(value));
  const session = createStandingSession(request);
  await session.start();
  expect(session.getSnapshot().standing).toEqual(value);
  request.mockImplementation(async () => reply({ error: 'private' }, 401));
  const pending = session.refresh();
  expect(session.getSnapshot().standing).toBeNull();
  await pending;
  expect(session.getSnapshot().status).toBe('unauthenticated');
  request.mockImplementation(async () =>
    reply({ ...value, subject: 'private' }),
  );
  await session.refresh();
  expect(session.getSnapshot()).toEqual({ status: 'error', standing: null });
  request.mockImplementation(async () => reply({ error: 'SQL canary' }, 503));
  await session.refresh();
  expect(session.getSnapshot().standing).toBeNull();
});
it('rejects superseded and unmounted replies even when cancellation is ignored', async () => {
  let resolve!: (value: Response) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    )
    .mockImplementation(async () =>
      reply({ ...value, points: 0, soleWins: 0, position: 2 }),
    );
  const session = createStandingSession(request);
  const old = session.start();
  await session.refresh();
  resolve(reply(value));
  await old;
  expect(session.getSnapshot().standing?.points).toBe(0);
  request.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const late = session.refresh();
  session.stop();
  resolve(reply(value));
  await late;
  expect(session.getSnapshot().standing).toBeNull();
  request.mockImplementation(async () => reply(value));
  await session.start();
  expect(session.getSnapshot().standing?.points).toBe(3);
});
