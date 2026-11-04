import { personalStandingSchema } from '@mamalik/shared';
import type { PersonalStanding } from '@mamalik/shared';
type View = {
  status: 'loading' | 'ready' | 'unauthenticated' | 'error';
  standing: PersonalStanding | null;
};
export function createStandingSession(request: typeof fetch = fetch) {
  let view: View = { status: 'loading', standing: null };
  let generation = 0,
    alive = true;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  function publish(next: View) {
    view = next;
    for (const listener of listeners) listener();
  }
  async function refresh() {
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    publish({ status: 'loading', standing: null });
    try {
      const response = await request('/api/standing', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!alive || current !== generation) return;
      if (!response.ok) {
        publish({
          status: response.status === 401 ? 'unauthenticated' : 'error',
          standing: null,
        });
        return;
      }
      const standing = personalStandingSchema.parse(await response.json());
      if (alive && current === generation)
        publish({ status: 'ready', standing });
    } catch {
      if (alive && current === generation)
        publish({ status: 'error', standing: null });
    }
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
      view = { status: 'loading', standing: null };
    },
    refresh,
  };
}
