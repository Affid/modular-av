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

export function writeFakeSpeech(path = FAKE_SPEECH_WAV): string {
  const samples = Math.round((TONE_S + SILENCE_S) * SAMPLE_RATE);
  const tone = Math.round(TONE_S * SAMPLE_RATE);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const value =
      i < tone
        ? AMPLITUDE * Math.sin((2 * Math.PI * FREQUENCY * i) / SAMPLE_RATE)
        : 0;
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
