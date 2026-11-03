import { expect, it, vi } from 'vitest';
import { createHistorySession } from './history-session';
const page = { items: [], nextCursor: 'next_cursor' };
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
it('navigates only server cursors, revalidates previous pages and resets on refresh', async () => {
  const fetcher = vi.fn().mockImplementation(async () => reply(page));
  const session = createHistorySession(fetcher);
  await session.start();
  await session.next();
  expect(fetcher.mock.calls[1]![0]).toBe('/api/history?cursor=next_cursor');
  expect(session.getSnapshot().index).toBe(1);
  await session.previous();
  expect(fetcher.mock.calls[2]![0]).toBe('/api/history');
  await session.refresh();
  expect(session.getSnapshot()).toMatchObject({ status: 'ready', index: 0 });
});
it('clears private results on errors and does not expose upstream details or retain stale pages', async () => {
  const fetcher = vi.fn().mockImplementation(async () => reply(page));
  const session = createHistorySession(fetcher);
  await session.start();
  fetcher.mockImplementation(async () =>
    reply({ error: 'private SQL detail' }, 401),
  );
  const refresh = session.refresh();
  expect(session.getSnapshot().page).toBeNull();
  await refresh;
  expect(session.getSnapshot()).toMatchObject({
    status: 'unauthenticated',
    page: null,
  });
  fetcher.mockImplementation(async () =>
    reply({ ...page, subject: 'private' }),
  );
  await session.refresh();
  expect(session.getSnapshot()).toMatchObject({ status: 'error', page: null });
  fetcher.mockImplementation(async () => reply({ error: 'private' }, 503));
  await session.refresh();
  expect(session.getSnapshot().page).toBeNull();
});
it('discards late data after refresh or unmount even if a transport ignores cancellation', async () => {
  let release!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    )
    .mockImplementation(async () => reply({ items: [], nextCursor: null }));
  const session = createHistorySession(fetcher);
  const old = session.start();
  await session.refresh();
  release(reply(page));
  await old;
  expect(session.getSnapshot().page?.nextCursor).toBeNull();
  fetcher.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const late = session.refresh();
  session.stop();
  release(reply(page));
  await late;
  expect(session.getSnapshot().page).toBeNull();
});
