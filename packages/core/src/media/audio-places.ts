import type { AudioPlace } from "@modular-av/api";

/** In the order they run. */
export const AUDIO_PLACES: readonly AudioPlace[] = [
  "pre-gate",
  "post-gate",
  "send",
];

/** Its effects replace the browser's noise suppression and run first. */
export const NOISE_SUPPRESSION_GROUP = "noise-suppression";

const isDuration = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

const isLevel = (value: unknown): boolean =>
  value === undefined ||
  (typeof value === "number" && value >= 0 && value <= 1);

/**
 * Refuses what would silently never run, or run for ever: a place this core
 * doesn't know, or a tail that isn't a length of time.
 */
export function validateEffect(definition: unknown): void {
  const { kind, defaultPlace, tail, latency, defaultMix } = definition as {
    readonly kind?: unknown;
    readonly defaultPlace?: unknown;
    readonly tail?: unknown;
    readonly latency?: unknown;
    readonly defaultMix?: unknown;
  };
  if (kind !== "audio") return;
  if (!AUDIO_PLACES.includes(defaultPlace as AudioPlace))
    throw new Error(`Unknown audio place "${String(defaultPlace)}"`);
  if (!isDuration(tail)) throw new Error("tail must be seconds, 0 or more");
  if (!isDuration(latency))
    throw new Error("latency must be seconds, 0 or more");
  if (!isLevel(defaultMix))
    throw new Error("defaultMix must be between 0 and 1");
}
