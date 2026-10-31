import type { AudioStage } from "@modular-av/api";

export const AUDIO_STAGES: readonly AudioStage[] = [
  "denoise",
  "voice",
  "post",
  "send",
];

const isDuration = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

const isLevel = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === "number" && value >= 0 && value <= 1);

/**
 * Refuses what would silently never run, or run for ever: a stage this core
 * doesn't know, or a tail that isn't a length of time.
 */
export function validateEffect(definition: unknown): void {
  const { kind, stage, tail, latency, defaultMix } = definition as {
    readonly kind?: unknown;
    readonly stage?: unknown;
    readonly tail?: unknown;
    readonly latency?: unknown;
    readonly defaultMix?: unknown;
  };
  if (kind !== "audio") return;
  if (!AUDIO_STAGES.includes(stage as AudioStage))
    throw new Error(`Unknown audio stage "${String(stage)}"`);
  if (!isDuration(tail)) throw new Error("tail must be seconds, 0 or more");
  if (!isDuration(latency))
    throw new Error("latency must be seconds, 0 or more");
  if (!isLevel(defaultMix))
    throw new Error("defaultMix must be between 0 and 1");
}
