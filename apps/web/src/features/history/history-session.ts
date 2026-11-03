import { matchHistoryPageSchema } from '@mamalik/shared';
import type { MatchHistoryPage } from '@mamalik/shared';
type View = {
  status: 'loading' | 'ready' | 'unauthenticated' | 'error';
  page: MatchHistoryPage | null;
  index: number;
};
/** Private data stays in memory. Every navigation clears it before revalidation. */
export function createHistorySession(request: typeof fetch = fetch) {
  let view: View = { status: 'loading', page: null, index: 0 };
  let cursors: (string | undefined)[] = [undefined];
  let generation = 0,
    alive = true;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  function publish(next: View) {
    view = next;
    for (const listener of listeners) listener();
  }
  async function load(index: number) {
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    publish({ status: 'loading', page: null, index });
    try {
      const cursor = cursors[index];
      const response = await request(
        `/api/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { cache: 'no-store', signal: controller.signal },
      );
      if (!alive || current !== generation) return;
      if (!response.ok) {
        publish({
          status: response.status === 401 ? 'unauthenticated' : 'error',
          page: null,
          index,
        });
        return;
      }
      const page = matchHistoryPageSchema.parse(await response.json());
      if (alive && current === generation)
        publish({ status: 'ready', page, index });
    } catch {
      if (alive && current === generation)
        publish({ status: 'error', page: null, index });
    }
  }
  function refresh() {
    cursors = [undefined];
    return load(0);
  }
  return {
    getSnapshot: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      alive = true;
      return refresh();
    },
    stop() {
      alive = false;
      generation++;
      controller?.abort();
      view = { status: 'loading', page: null, index: 0 };
      cursors = [undefined];
    },
    refresh,
    next() {
      if (view.status !== 'ready' || !view.page?.nextCursor) return;
      cursors = [...cursors.slice(0, view.index + 1), view.page.nextCursor];
      return load(view.index + 1);
    },
    previous() {
      if (view.status === 'ready' && view.index > 0)
        return load(view.index - 1);
    },
  };
}
