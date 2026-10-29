import { Client } from '@colyseus/sdk';
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
const storageKey = 'mamalik.room.v2';

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
    if (!room?.connection.isOpen) return;
    const nonce = crypto.randomUUID();
    pings.set(nonce, performance.now());
    if (pings.size > 4) pings.delete(pings.keys().next().value!);
    lastSync = performance.now();
    room.send('sync', { nonce });
  };
  function attach(next: Room) {
    room = next;
    const attachedGeneration = generation;
    const isCurrent = () =>
      alive && room === next && generation === attachedGeneration;
    room.reconnection.minUptime = 0;
    room.reconnection.maxEnqueuedMessages = 0;
    room.onMessage('snapshot', (input: unknown) => {
      if (!isCurrent()) return;
      const parsed = roomSnapshotSchema.safeParse(input);
      if (!parsed.success) {
        publish({ error: 'وصلت حالة غير متوافقة؛ أعد الاتصال.' });
        return;
      }
      const data = parsed.data;
      const previous = view.snapshot;
      if (
        previous?.roomId === data.roomId &&
        data.sequence <= previous.sequence
      )
        return;
      if (offset === null) offset = data.serverNow - performance.now();
      const sameQuestion =
        previous?.state?.question?.id === data.state?.question?.id &&
        previous?.state?.turn === data.state?.turn;
      publish({
        snapshot: data,
        status: data.closed ? 'closed' : 'connected',
        pendingAnswer:
          sameQuestion && !data.ownChoiceId ? view.pendingAnswer : null,
        estimatedNow: Math.max(data.serverNow, performance.now() + offset),
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
      if (parsed.data.type === 'COMMAND_REJECTED')
        publish({
          error: `رُفض الإجراء (${parsed.data.error}). راجع الدور والمهلة.`,
          pendingAnswer: null,
        });
    });
    room.onDrop(() => {
      if (!isCurrent()) return;
      publish({
        status: 'reconnecting',
        pendingAnswer: null,
        error: 'انقطع الاتصال. نحاول استعادة مقعدك؛ الوقت مستمر.',
      });
    });
    room.onReconnect(() => {
      if (!isCurrent()) return;
      offset = null;
      bestRtt = Infinity;
      pings.clear();
      publish({ status: 'reconnecting', error: '' });
      save();
      sync();
    });
    room.onLeave(() => {
      if (isCurrent())
        publish({
          status: 'closed',
          pendingAnswer: null,
          error:
            'انتهى الاتصال بالغرفة. يمكنك محاولة الاستعادة خلال مهلة الثلاثين ثانية.',
        });
    });
    room.onError(() => {
      if (isCurrent()) publish({ error: 'تعذّر إكمال الاتصال بالغرفة.' });
    });
    save();
    publish({ status: 'connected', error: '' });
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
    });
    offset = null;
    bestRtt = Infinity;
    pings.clear();
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
    } catch {
      if (alive && generation === current)
        publish({
          status: 'error',
          error:
            'تعذّر الاتصال. تحقّق من تشغيل خدمة اللعبة ورمز الدعوة أو مهلة الاستعادة.',
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
      generation++;
      if (room) {
        room.reconnection.enabled = false;
        room.connection.close(4010);
      }
    },
    tick() {
      if (offset !== null)
        publish({
          estimatedNow: Math.max(
            view.snapshot?.serverNow ?? 0,
            performance.now() + offset,
          ),
        });
      if (performance.now() - lastSync > 5000) sync();
    },
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
