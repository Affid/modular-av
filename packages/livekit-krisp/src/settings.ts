import type { KrispQuality } from "./krisp.ts";

export const MODULE_ID = "modular-av-livekit-krisp";
export const QUALITY_SETTING = "quality";
export const QUALITIES: readonly KrispQuality[] = ["low", "medium", "high"];
const DEFAULT_QUALITY: KrispQuality = "medium";

/** The slice of Foundry's settings this module uses. */
export interface SettingsApi {
  register(
    namespace: string,
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
}

/** Per device: how much of this computer Krisp may take; `onChange` on a change. */
export function registerSettings(
  settings: Pick<SettingsApi, "register">,
  onChange: () => void = () => undefined,
): void {
  const choices = Object.fromEntries(
    QUALITIES.map((q) => [q, `${MODULE_ID}.settings.quality.choices.${q}`]),
  );
  settings.register(MODULE_ID, QUALITY_SETTING, {
    name: `${MODULE_ID}.settings.quality.name`,
    hint: `${MODULE_ID}.settings.quality.hint`,
    scope: "client",
    config: false,
    type: String,
    choices,
    default: DEFAULT_QUALITY,
    onChange,
  });
}

export function readQuality(settings: Pick<SettingsApi, "get">): KrispQuality {
  const value = settings.get(MODULE_ID, QUALITY_SETTING);
  return QUALITIES.find((q) => q === value) ?? DEFAULT_QUALITY;
}
