import type {
  AudioEffectDefinition,
  Observable,
  SettingsSectionContribution,
} from "@modular-av/api";
import type { KrispModule, KrispQuality } from "./krisp.ts";
import { MODULE_ID, QUALITY_SETTING } from "./settings.ts";

/** Reported by modular-av-livekit while the call is on LiveKit Cloud. */
export const CLOUD_FEATURE = "livekit-cloud";

export interface KrispDefinitionDeps {
  readonly load: () => Promise<KrispModule>;
  readonly room: Observable<object | null>;
  readonly quality: () => KrispQuality;
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
    id: "krisp",
    kind: "audio",
    label: `${MODULE_ID}.label`,
    stage: "denoise",
    exclusiveGroup: "noise-suppression",
    cost: "medium",
    requires: [CLOUD_FEATURE],
    isSupported: canRun,
    async create(context) {
      const [{ startKrisp }, { createBridge }] = await Promise.all([
        import("./effect.ts"),
        import("./bridge.ts"),
      ]);
      return startKrisp({ ...deps, createBridge }, context);
    },
  };
}

/** Krisp's own setting, shown in the UI's settings window. */
export const krispSection: SettingsSectionContribution = {
  kind: "settings-section",
  id: `${MODULE_ID}.section`,
  label: `${MODULE_ID}.section`,
  icon: "fa-solid fa-wave-square",
  settings: [`${MODULE_ID}.${QUALITY_SETTING}`],
};
