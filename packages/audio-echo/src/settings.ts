import {
  clientNumber,
  type NumberSetting,
  type SettingsApi,
} from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";

export interface EchoSettings {
  /** In milliseconds. */
  readonly time: NumberSetting;
  /** In seconds: it can't ring past the 3 s the definition declares. */
  readonly decay: NumberSetting;
}

export const TIME = { min: 50, max: 600, value: 300 } as const;
export const DECAY = { min: 0.3, max: 3, value: 1.5 } as const;

/** Per device, as a player sets it up for one voice. */
export function registerSettings(settings: SettingsApi): EchoSettings {
  return {
    time: clientNumber(settings, MODULE_ID, "time", TIME),
    decay: clientNumber(settings, MODULE_ID, "decay", DECAY),
  };
}
