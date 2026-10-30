import { Client } from '@colyseus/sdk';
import { admissionErrorMessage } from './admission-errors';
import type { Room } from '@colyseus/sdk';
import {
  PROTOCOL_VERSION,
  clockReplySchema,
  commandSchema,
  eventSchema,
  joinOptionsSchema,
  roomSnapshotSchema,
} from '@mamalik/shared';
import type { RoomSnapshot } from '@mamalik/shared';

export interface OnlineView {
  status:
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';
  snapshot: RoomSnapshot | null;
  error: string;
  estimatedNow: number;
  rttMs: number | null;
  pendingAnswer: string | null;
  searching: boolean;
}
const storageKey = 'mamalik.room.v3';

/** Network presentation adapter: no answers, bot policy, scoring or lifecycle decisions. */
export function createOnlineSession(endpoint: string) {
  let view: OnlineView = {
    status: 'idle',
    snapshot: null,
    error: '',
    estimatedNow: 0,
    rttMs: null,
    pendingAnswer: null,
    searching: false,
  };
  let room: Room | null = null;
  let alive = true;
  let offset: number | null = null;
  let bestRtt = Infinity;
  let lastSync = -Infinity;
  let generation = 0;
  let cancelledThrough = 0;
  let recovering = false;
  let recoveryFloor: number | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const pings = new Map<string, number>();
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<OnlineView>) => {
    view = { ...view, ...patch };
    for (const listener of listeners) listener();
  };
  const save = () => {
    if (!room) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ endpoint, token: room.reconnectionToken }),
      );
    } catch {
      /* Memory-only recovery still works. */
    }
  };
  const forget = () => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage can be disabled. */
    }
  };
  const sync = () => {
    if (
      !alive ||
      !room?.connection.isOpen ||
      performance.now() - lastSync < 250
    )
      return;
    const nonce = crypto.randomUUID();
    pings.set(nonce, performance.now());
    if (pings.size > 4) pings.delete(pings.keys().next().value!);
    lastSync = performance.now();
    room.send('sync', { nonce });
  };
  const clearRefresh = () => {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = null;
  };
  const refresh = () => {
    if (!alive || !room?.connection.isOpen) return;
    bestRtt = Infinity;
    const delay = Math.max(0, 250 - (performance.now() - lastSync));
    if (delay === 0) {
      clearRefresh();
      sync();
    } else if (refreshTimer === null)
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        sync();
      }, delay);
  };
  function attach(next: Room) {
    room = next;
    const attachedGeneration = generation;
    const isCurrent = () =>
      alive && room === next && generation === attachedGeneration;
    room.reconnection.minUptime = 0;
    room.reconnection.maxEnqueuedMessages = 0;
    room.onMessage('snapshot', (input: unknown) => {
      if (!isCurrent() || !next.connection.isOpen) return;
      const parsed = roomSnapshotSchema.safeParse(input);
      if (!parsed.success) {
        publish({ error: 'وصلت حالة غير متوافقة؛ أعد الاتصال.' });
        return;
      }
      const data = parsed.data;
      // A buffered pre-drop message cannot unlock actions. The recovery sync
      // clock precedes its full snapshot on the authoritative transport.
      if (
        recovering &&
        (recoveryFloor === null || data.serverNow < recoveryFloor)
      )
        return;
      const previous = view.snapshot;
      if (
        previous?.roomId === data.roomId &&
        data.sequence <= previous.sequence
      )
        return;
      if (offset === null) offset = data.serverNow - performance.now();
      const recovered = recovering;
      recovering = false;
      recoveryFloor = null;
      const sameQuestion =
        previous?.state?.question?.id === data.state?.question?.id &&
        previous?.state?.turn === data.state?.turn;
      publish({
        snapshot: data,
        status: data.closed ? 'closed' : 'connected',
        error: recovered ? '' : view.error,
        pendingAnswer:
          sameQuestion && !data.ownChoiceId ? view.pendingAnswer : null,
        estimatedNow: Math.max(
          view.estimatedNow,
          data.serverNow,
          performance.now() + offset,
        ),
      });
      save();
    });
    room.onMessage('clock', (input: unknown) => {
      if (!isCurrent()) return;
      const parsed = clockReplySchema.safeParse(input);
      if (!parsed.success) return;
      const sent = pings.get(parsed.data.nonce);
      if (sent === undefined) return;
      pings.delete(parsed.data.nonce);
      const received = performance.now();
      if (recovering)
        recoveryFloor = Math.max(recoveryFloor ?? 0, parsed.data.serverNow);
      const rtt = received - sent;
      if (rtt <= bestRtt) {
        bestRtt = rtt;
        offset = parsed.data.serverNow + rtt / 2 - received;
      }
      publish({ rttMs: Math.round(rtt) });
    });
    room.onMessage('event', (input: unknown) => {
      if (!isCurrent()) return;
      const parsed = eventSchema.safeParse(input);
      if (!parsed.success) return;
      const event = parsed.data;
      const snapshot = view.snapshot;
      const state = snapshot?.state;
      if (
        view.status !== 'connected' ||
        !state ||
        event.matchId !== state.matchId ||
        event.turn !== state.turn ||
        event.sequence < snapshot.sequence
      )
        return;
      if (event.type === 'COMMAND_REJECTED')
        publish({
          error: `رُفض الإجراء (${event.error}). راجع الدور والمهلة.`,
          pendingAnswer:
            event.idempotencyKey === `SUBMIT_ANSWER_${state.turn}`
              ? null
              : view.pendingAnswer,
        });
      else if (event.type === 'ANSWER_ACKNOWLEDGED' && view.pendingAnswer)
        refresh();
    });
    room.onDrop(() => {
      if (!isCurrent()) return;
      recovering = true;
      recoveryFloor = null;
      pings.clear();
      clearRefresh();
      publish({
        status: 'reconnecting',
        pendingAnswer: null,
        error: 'انقطع الاتصال. نحاول استعادة مقعدك؛ الوقت مستمر.',
      });
    });
    room.onReconnect(() => {
      if (!isCurrent()) return;
      offset = null;
      recovering = true;
      recoveryFloor = null;
      bestRtt = Infinity;
      pings.clear();
      publish({ status: 'reconnecting', error: '' });
      // The SDK rotates its bearer token and sends JOIN_ROOM acknowledgement
      // after invoking this callback. Run after that finally block.
      queueMicrotask(() => {
        if (!isCurrent()) return;
        save();
        lastSync = -Infinity;
        sync();
      });
    });
    room.onLeave(() => {
      if (isCurrent())
        publish({
          status: 'closed',
          pendingAnswer: null,
          error:
            'توقفت محاولة الاتصال. يمكنك إعادة المحاولة إن كانت مهلة الاستعادة ما تزال سارية.',
        });
    });
    room.onError(() => {
      if (isCurrent()) publish({ error: 'تعذّر إكمال الاتصال بالغرفة.' });
    });
    save();
    publish({ status: 'connecting', error: '' });
    sync();
  }
  async function connect(
    kind: 'create' | 'join' | 'restore' | 'queue',
    name = '',
    code = '',
  ) {
    if (
      view.status === 'connecting' ||
      view.status === 'reconnecting' ||
      view.status === 'connected'
    )
      return;
    const current = ++generation;
    publish({
      status: 'connecting',
      error: '',
      snapshot: null,
      searching: kind === 'queue',
      estimatedNow: 0,
      rttMs: null,
      pendingAnswer: null,
    });
    offset = null;
    bestRtt = Infinity;
    pings.clear();
    clearRefresh();
    lastSync = -Infinity;
    recovering = false;
    recoveryFloor = null;
    try {
      const client = new Client(endpoint);
      let next: Room;
      if (kind === 'restore') {
        const stored: unknown = JSON.parse(
          sessionStorage.getItem(storageKey) ?? 'null',
        );
        if (
          typeof stored !== 'object' ||
          !stored ||
          !('token' in stored) ||
          typeof stored.token !== 'string' ||
          !('endpoint' in stored) ||
          stored.endpoint !== endpoint
        )
          throw new Error('No saved seat');
        next = await client.reconnect(stored.token);
      } else {
        const options = joinOptionsSchema.parse({ name });
        if (kind === 'join' && !/^[a-f0-9]{16}$/.test(code.trim()))
          throw new Error('Invalid invite');
        next =
          kind === 'create'
            ? await client.create('kingdom', options)
            : kind === 'queue'
              ? await client.joinOrCreate('kingdom_queue', options)
              : await client.joinById(code.trim(), options);
      }
      if (!alive || generation !== current) {
        next.reconnection.enabled = false;
        if (current <= cancelledThrough) await next.leave();
        else next.connection.close(4010);
        return;
      }
      attach(next);
    } catch (error) {
      if (alive && generation === current)
        publish({
          status: 'error',
          error: admissionErrorMessage(error),
        });
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
    connect,
    restoreIfSaved() {
      try {
        if (sessionStorage.getItem(storageKey)) void connect('restore');
      } catch {
        /* Optional storage. */
      }
    },
    activate() {
      alive = true;
    },
    suspend() {
      alive = false;
      clearRefresh();
      generation++;
      if (room) {
        room.reconnection.enabled = false;
        room.connection.close(4010);
      }
    },
    tick() {
      if (!alive) return;
      if (offset !== null)
        publish({
          estimatedNow: Math.max(
            view.estimatedNow,
            view.snapshot?.serverNow ?? 0,
            performance.now() + offset,
          ),
        });
      if (performance.now() - lastSync > 5000) sync();
    },
    refresh,
    send(
      type: 'READY' | 'SELECT_TARGET' | 'SUBMIT_ANSWER',
      fields: {
        targetId?: string;
        choiceId?: string;
        questionId?: string;
      } = {},
    ) {
      const state = view.snapshot?.state;
      if (!state || view.status !== 'connected' || !room?.connection.isOpen)
        return;
      if (
        type === 'SUBMIT_ANSWER' &&
        (view.pendingAnswer || view.snapshot?.ownChoiceId)
      )
        return;
      const command = {
        protocolVersion: PROTOCOL_VERSION,
        matchId: state.matchId,
        turn: state.turn,
        idempotencyKey: `${type}_${state.turn}`,
        type,
        ...fields,
      };
      // Schema validation is repeated at the authoritative transport boundary.
      room.send('command', commandSchema.parse(command));
      publish({
        error: '',
        ...(type === 'SUBMIT_ANSWER'
          ? { pendingAnswer: fields.choiceId ?? null }
          : {}),
      });
    },
    async leave() {
      forget();
      clearRefresh();
      cancelledThrough = generation;
      generation++;
      const previous = room;
      room = null;
      publish({
        status: 'idle',
        snapshot: null,
        error: '',
        pendingAnswer: null,
        searching: false,
      });
      await previous?.leave();
    },
  };
}
