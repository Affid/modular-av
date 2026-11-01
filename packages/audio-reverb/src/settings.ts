import {
  clientNumber,
  type NumberSetting,
  type SettingsApi,
} from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";

export interface ReverbSettings {
  /** In seconds: it can't ring past the 3 s the definition declares. */
  readonly decay: NumberSetting;
  /** 0 to 1. */
  readonly brightness: NumberSetting;
}

export const DECAY = { min: 0.3, max: 3, value: 1.5 } as const;
const BRIGHTNESS = { min: 0, max: 1, value: 0.5 } as const;

/** Per device, as a player sets it up for one voice and one machine. */
export function registerSettings(settings: SettingsApi): ReverbSettings {
  return {
    decay: clientNumber(settings, MODULE_ID, "decay", DECAY),
    brightness: clientNumber(settings, MODULE_ID, "brightness", BRIGHTNESS),
  };
}
