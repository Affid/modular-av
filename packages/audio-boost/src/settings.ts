import {
  clientNumber,
  type NumberSetting,
  type SettingsApi,
} from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";

/** `boost` in dB; `evenness` 0 to 1, how hard peaks are evened out. */
export interface BoostSettings {
  readonly boost: NumberSetting;
  readonly evenness: NumberSetting;
}

export const BOOST_DB = { min: 0, max: 24, value: 6 } as const;
export const EVENNESS = { min: 0, max: 1, value: 0.5 } as const;

/** Per device: how quiet a microphone is belongs to the machine. */
export function registerSettings(settings: SettingsApi): BoostSettings {
  return {
    boost: clientNumber(settings, MODULE_ID, "boost", BOOST_DB),
    evenness: clientNumber(settings, MODULE_ID, "evenness", EVENNESS),
  };
}
