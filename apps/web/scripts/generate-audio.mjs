// Original synthesized game cues: no samples, recordings, random input or external assets.
// Regenerate from the repository root: node apps/web/scripts/generate-audio.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const rate = 22050;
const samples = new Float64Array(rate * 3.8);
const note = (start, duration, frequency, gain = 0.24) => {
  for (let i = 0; i < Math.floor(rate * duration); i++) {
    const t = i / rate;
    const envelope = Math.min(1, t / 0.012) * Math.pow(1 - t / duration, 2);
    samples[Math.floor(start * rate) + i] +=
      gain *
      envelope *
      (Math.sin(2 * Math.PI * frequency * t) +
        0.18 * Math.sin(4 * Math.PI * frequency * t));
  }
};
note(0, 0.22, 523.25);
note(0.4, 0.22, 392);
note(0.54, 0.22, 523.25);
note(0.9, 0.16, 659.25, 0.18);
note(1.06, 0.16, 523.25, 0.18);
note(1.4, 0.25, 523.25);
note(1.56, 0.25, 659.25);
note(1.72, 0.27, 783.99);
note(2.1, 0.35, 392, 0.2);
note(2.1, 0.35, 293.66, 0.12);
note(2.7, 0.3, 523.25);
note(2.9, 0.3, 659.25);
note(3.1, 0.47, 783.99);
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
for (let i = 0; i < samples.length; i++) {
  if (Math.abs(samples[i]) >= 1) throw new Error('Clipped audio');
  wav.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2);
}
const destination = new URL('../public/audio/', import.meta.url);
mkdirSync(destination, { recursive: true });
writeFileSync(new URL('kingdom-cues.wav', destination), wav);
console.log(`Generated ${wav.length} bytes of original mono PCM cues.`);
