import type { Cue } from './cues';

export interface AudioPort {
  play(cue: Cue): void;
  volume(value: number): void;
  stop(): void;
  dispose(): void;
}
export type AudioFactory = (events: {
  ready(): void;
  failed(): void;
}) => AudioPort;
export type AudioSettings = Readonly<{
  status: 'muted' | 'loading' | 'on' | 'error';
  volume: number;
}>;
const initial: AudioSettings = { status: 'muted', volume: 0.35 };

/** No clock, game commands, storage or global volume. One controller per game page. */
export function createAudioController(factory: AudioFactory) {
  let snapshot = initial;
  let port: AudioPort | null = null;
  let generation = 0;
  let visible = true;
  const listeners = new Set<() => void>();
  const update = (next: AudioSettings) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const release = () => {
    generation++;
    const previous = port;
    port = null;
    try {
      previous?.dispose();
    } catch {
      // Browser audio cleanup must not interrupt navigation or a game action.
    }
  };
  const fail = () => {
    release();
    update({ ...snapshot, status: 'error' });
  };
  const play = (cue: Cue) => {
    if (snapshot.status !== 'on' || !visible || snapshot.volume === 0) return;
    try {
      port?.stop();
      port?.play(cue);
    } catch {
      fail();
    }
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    enable() {
      release();
      const current = generation;
      update({ ...snapshot, status: 'loading' });
      try {
        const created = factory({
          ready() {
            if (current !== generation) return;
            try {
              port?.volume(snapshot.volume);
            } catch {
              fail();
              return;
            }
            update({ ...snapshot, status: 'on' });
            play('preview');
          },
          failed() {
            if (current === generation) fail();
          },
        });
        if (current !== generation) {
          created.dispose();
          return;
        }
        port = created;
        port.volume(snapshot.volume);
      } catch {
        fail();
      }
    },
    mute() {
      release();
      update({ ...snapshot, status: 'muted' });
    },
    setVolume(value: number) {
      if (!Number.isFinite(value)) return;
      const volume = Math.max(0, Math.min(1, value));
      update({ ...snapshot, volume });
      try {
        port?.volume(volume);
        if (!volume) port?.stop();
      } catch {
        fail();
      }
    },
    setVisible(value: boolean) {
      visible = value;
      if (
        !value &&
        (snapshot.status === 'on' || snapshot.status === 'loading')
      ) {
        release();
        update({ ...snapshot, status: 'muted' });
      }
    },
    play,
    dispose() {
      release();
      snapshot = initial;
    },
  };
}
