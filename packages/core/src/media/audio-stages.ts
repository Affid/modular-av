import type { AudioStage } from "@modular-av/api";

export const AUDIO_STAGES: readonly AudioStage[] = [
  "denoise",
  "voice",
  "post",
  "send",
];

/** An effect in a stage this core doesn't know would silently never run. */
export function validateEffect(definition: unknown): void {
  const { kind, stage } = definition as { kind?: unknown; stage?: unknown };
  if (kind === "audio" && !AUDIO_STAGES.includes(stage as AudioStage))
    throw new Error(`Unknown audio stage "${String(stage)}"`);
}
