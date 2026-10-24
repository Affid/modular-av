import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * A WAV for Chrome's fake microphone (--use-file-for-fake-audio-capture):
 * 1.5 s of tone, 1.5 s of silence, looped by Chrome. Unlike its default
 * short beeps, this is speech long enough for "speaking while muted".
 */
export const FAKE_SPEECH_WAV = join(
  import.meta.dirname,
  "..",
  "..",
  "test-results",
  "fake-speech.wav",
);

const SAMPLE_RATE = 48_000;
const TONE_S = 1.5;
const SILENCE_S = 1.5;
const AMPLITUDE = 0.3;
const FREQUENCY = 440;

/** Writes 16-bit mono PCM at 48 kHz. */
function writeWav(
  path: string,
  sample: (i: number) => number,
  count: number,
): string {
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i += 1) {
    const value = Math.max(-1, Math.min(1, sample(i)));
    data.writeInt16LE(Math.round(value * 32_767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, data]));
  return path;
}

export function writeFakeSpeech(path = FAKE_SPEECH_WAV): string {
  const tone = Math.round(TONE_S * SAMPLE_RATE);
  return writeWav(
    path,
    (i) =>
      i < tone
        ? AMPLITUDE * Math.sin((2 * Math.PI * FREQUENCY * i) / SAMPLE_RATE)
        : 0,
    Math.round((TONE_S + SILENCE_S) * SAMPLE_RATE),
  );
}

/**
 * For the effects tier: a voice-like sound (harmonics of 140 Hz, swelling
 * four times a second, 2 s on and 1 s quieter) over steady noise at about
 * -40 dBFS, never silent, so a gap in a noise model's output shows as a
 * run of exact zeros.
 */
export const FAKE_VOICE_WAV = join(dirname(FAKE_SPEECH_WAV), "fake-voice.wav");

const VOICE_S = 3;
const NOISE = 0.01;

export function writeFakeVoice(path = FAKE_VOICE_WAV): string {
  let seed = 1;
  const noise = (): number => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed / 2_147_483_647) * 2 - 1;
  };
  return writeWav(
    path,
    (i) => {
      const t = i / SAMPLE_RATE;
      const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t);
      const loud = t % VOICE_S < 2 ? 0.06 : 0.01;
      let voice = 0;
      for (let h = 1; h <= 12; h += 1)
        voice += Math.sin(2 * Math.PI * 140 * h * t) / h;
      return NOISE * noise() + loud * swell * voice;
    },
    VOICE_S * SAMPLE_RATE,
  );
}
