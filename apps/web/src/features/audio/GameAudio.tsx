'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { PublicState } from '@mamalik/shared';
import { createAudioController } from './controller';
import { createCueTracker } from './cues';
import { createHowlerPort } from './howler-port';
import './audio.css';

const AudioContext = createContext<ReturnType<
  typeof createAudioController
> | null>(null);

export function GameAudio({ children }: { children: ReactNode }) {
  const [audio] = useState(() => createAudioController(createHowlerPort));
  useEffect(() => {
    const visibility = () =>
      audio.setVisible(document.visibilityState === 'visible');
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      audio.dispose();
    };
  }, [audio]);
  return (
    <AudioContext.Provider value={audio}>
      <AudioControls />
      {children}
    </AudioContext.Provider>
  );
}

export function AudioControls() {
  const audio = useContext(AudioContext);
  return audio ? <Controls audio={audio} /> : null;
}

function Controls({
  audio,
}: {
  audio: ReturnType<typeof createAudioController>;
}) {
  const settings = useSyncExternalStore(
    audio.subscribe,
    audio.getSnapshot,
    audio.getSnapshot,
  );
  const volumeId = useId();
  const enabled = settings.status === 'on' || settings.status === 'loading';
  return (
    <section
      className="game-audio"
      aria-label="إعدادات الصوت"
      data-audio-status={settings.status}
    >
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => (enabled ? audio.mute() : audio.enable())}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M11 4 5 9H2v6h3l6 5V4Z" />
          {enabled ? (
            <path d="M15 8c3 2 3 6 0 8m3-12c6 4 6 12 0 16" />
          ) : (
            <path d="m16 9 6 6m0-6-6 6" />
          )}
        </svg>
        {enabled ? 'كتم الصوت' : 'تشغيل الصوت'}
      </button>
      <label htmlFor={volumeId}>مستوى الصوت</label>
      <input
        id={volumeId}
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round(settings.volume * 100)}
        aria-valuetext={`${Math.round(settings.volume * 100)}٪`}
        onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
      />
      <span role="status">
        {settings.status === 'error'
          ? 'تعذّر تشغيل الصوت. حاول مجددًا؛ يمكنك متابعة اللعب.'
          : settings.status === 'loading'
            ? 'جارٍ تحميل الصوت…'
            : enabled
              ? 'مؤثرات قصيرة فقط'
              : 'الصوت اختياري ومكتوم'}
      </span>
    </section>
  );
}

export function useMatchAudio(
  state: PublicState | null | undefined,
  playerId: string,
  connected = true,
) {
  const audio = useContext(AudioContext);
  const [track] = useState(createCueTracker);
  useEffect(() => {
    const cue = track(state ?? undefined, playerId, connected);
    if (cue) audio?.play(cue);
  }, [state, playerId, connected, audio, track]);
}
