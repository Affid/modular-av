import type { AudioEffectDefinition, Observable } from "@modular-av/api";
import type { KrispModule, KrispQuality } from "./krisp.ts";
import { KRISP_EFFECT } from "./quality.ts";
import { MODULE_ID } from "./settings.ts";

/** Reported by modular-av-livekit while the call is on LiveKit Cloud. */
export const CLOUD_FEATURE = "livekit-cloud";

export interface KrispDefinitionDeps {
  readonly load: () => Promise<KrispModule>;
  readonly room: Observable<object | null>;
  readonly quality: () => KrispQuality;
  readonly onError: (error: unknown) => void;
}

/** AudioWorklet (secure contexts only) and WebAssembly, before downloading. */
const canRun = (): boolean =>
  typeof globalThis.AudioWorkletNode === "function" &&
  typeof globalThis.WebAssembly === "object" &&
  globalThis.isSecureContext;

/**
 * Krisp in the core's chain, in the noise-suppression group: offered only
 * on LiveKit Cloud, which licenses it. Its code comes in `create()`.
 */
export function createKrispDefinition(
  deps: KrispDefinitionDeps,
): AudioEffectDefinition {
  return {
    id: KRISP_EFFECT,
    kind: "audio",
    label: `${MODULE_ID}.label`,
    defaultPlace: "pre-gate",
    exclusiveGroup: "noise-suppression",
    cost: "medium",
    requires: [CLOUD_FEATURE],
    // It may gate noise to digital silence, which isn't a stalled model.
    silencesNoise: true,
    isSupported: canRun,
    async create(context) {
      const [{ startKrisp }, { createBridge }] = await Promise.all([
        import("./effect.ts"),
        import("./bridge.ts"),
      ]);
      return startKrisp(
        { ...deps, createBridge, now: () => Date.now() },
        context,
      );
    },
  };
}
