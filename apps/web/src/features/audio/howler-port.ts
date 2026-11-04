import { Howl, Howler } from 'howler';
import type { AudioFactory } from './controller';

// This module creates no Howl/context until the explicit enable gesture.
export const createHowlerPort: AudioFactory = ({ ready, failed }) => {
  let active = true;
  const timer = window.setTimeout(() => {
    if (active) failed();
  }, 12000);
  const sound = new Howl({
    src: ['/audio/kingdom-cues.wav'],
    preload: true,
    autoplay: false,
    loop: false,
    volume: 0,
    sprite: {
      preview: [0, 260],
      turn: [400, 380],
      question: [900, 350],
      capture: [1400, 600],
      hold: [2100, 400],
      finish: [2700, 900],
    },
    onload() {
      window.clearTimeout(timer);
      if (active) ready();
    },
    onloaderror() {
      if (active) failed();
    },
    onplayerror() {
      if (active) failed();
    },
  });
  // Run synchronously in the click handler, including on a subsequent retry.
  if (Howler.ctx?.state === 'suspended')
    void Howler.ctx.resume().catch(() => {
      if (active) failed();
    });
  return {
    play: (cue) => {
      sound.play(cue);
    },
    volume: (value) => {
      sound.volume(value);
    },
    stop: () => {
      sound.stop();
    },
    dispose() {
      active = false;
      window.clearTimeout(timer);
      sound.unload();
    },
  };
};
