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

const AUDIO_ONLY = [
  "defaultPlace",
  "silencesNoise",
  "tail",
  "latency",
  "defaultMix",
] as const;

/**
 * Refuses what would silently never run or run for ever, a duration or level
 * the chain can't use, and audio fields on a video effect.
 */
export function validateEffect(definition: unknown): void {
  const fields = definition as Readonly<Record<string, unknown>>;
  const { kind, defaultPlace, tail, latency, defaultMix } = fields;
  if (kind === "video") {
    const audio = AUDIO_ONLY.find((field) => fields[field] !== undefined);
    if (audio) throw new Error(`${audio} is for audio effects`);
    return;
  }
  if (kind !== "audio")
    throw new Error(`Unknown effect kind "${String(kind)}"`);
  if (!AUDIO_PLACES.includes(defaultPlace as AudioPlace))
    throw new Error(`Unknown audio place "${String(defaultPlace)}"`);
  if (!isDuration(tail)) throw new Error("tail must be seconds, 0 or more");
  if (!isDuration(latency))
    throw new Error("latency must be seconds, 0 or more");
  if (!isLevel(defaultMix))
    throw new Error("defaultMix must be between 0 and 1");
}
