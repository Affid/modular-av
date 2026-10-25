import type { EffectCost } from "@modular-av/api";

export const MODULE_ID = "modular-av-mic-denoise";

export type ModelId = "rnnoise" | "speex" | "gtcrn";

/** One noise model of @sapphi-red/web-noise-suppressor, as this module serves it. */
export interface ModelSpec {
  readonly id: ModelId;
  readonly label: string;
  /**
   * Measured in GPU Chrome on a fast desktop (handoff §14): RNNoise about
   * 2% of one core, Speex under 1%, GTCRN about 5%, and GTCRN runs in
   * bursts (one 768-sample hop every 16 ms), so slow machines may crackle.
   */
  readonly cost: EffectCost;
  /** Paths in this module's directory (`modularAV.assets` in package.json). */
  readonly worklet: string;
  readonly wasm: string;
  /** RNNoise has a SIMD build, used where the browser supports it. */
  readonly simdWasm?: string;
}

/** In the order players see them: the recommended one first. */
export const MODELS: readonly ModelSpec[] = [
  {
    id: "rnnoise",
    label: `${MODULE_ID}.models.rnnoise`,
    cost: "light",
    worklet: "models/rnnoise-worklet.js",
    wasm: "models/rnnoise.wasm",
    simdWasm: "models/rnnoise_simd.wasm",
  },
  {
    id: "speex",
    label: `${MODULE_ID}.models.speex`,
    cost: "light",
    worklet: "models/speex-worklet.js",
    wasm: "models/speex.wasm",
  },
  {
    id: "gtcrn",
    label: `${MODULE_ID}.models.gtcrn`,
    cost: "medium",
    worklet: "models/gtcrn-worklet.js",
    wasm: "models/gtcrn.wasm",
  },
];
