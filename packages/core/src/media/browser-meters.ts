import type { LevelMeter } from "./env.ts";

const SILENCE_DB = -100;
const WINDOW_SAMPLES = 1024;

/**
 * One meter context per page, apart from the capture context (which is
 * suspended without a microphone): created with the first meter of
 * another player, suspended once none is left. Remote WebRTC audio can be
 * measured here because the core also plays it through an element.
 */
let context: AudioContext | null = null;
let meters = 0;

const toDb = (samples: Float32Array): number => {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  const db = rms > 0 ? 20 * Math.log10(rms) : SILENCE_DB;
  return Math.round(Math.min(0, Math.max(SILENCE_DB, db)) * 10) / 10;
};

export function createBrowserLevelMeter(track: MediaStreamTrack): LevelMeter {
  const ctx = (context ??= new AudioContext());
  meters += 1;
  // Not awaited: under an autoplay policy, resuming waits for a gesture.
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = WINDOW_SAMPLES;
  source.connect(analyser);
  const samples = new Float32Array(WINDOW_SAMPLES);
  let disposed = false;
  return {
    read() {
      analyser.getFloatTimeDomainData(samples);
      return toDb(samples);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      source.disconnect();
      analyser.disconnect();
      meters -= 1;
      if (meters === 0) ctx.suspend().catch(() => undefined);
    },
  };
}
