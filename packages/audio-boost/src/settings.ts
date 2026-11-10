import {
  savedNumber,
  type NumberSetting,
  type StoredSettings,
} from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";

/** `boost` in dB; `evenness` 0 to 1, how hard peaks are evened out. */
export interface BoostSettings {
  readonly boost: NumberSetting;
  readonly evenness: NumberSetting;
}

export const BOOST_DB = { min: 0, max: 24, value: 6 } as const;
export const EVENNESS = { min: 0, max: 1, value: 0.5 } as const;

/**
 * How much to boost is the machine's (how quiet its microphone is), how
 * evenly to speak is the player's taste.
 */
export function registerSettings(settings: StoredSettings): BoostSettings {
  return {
    boost: savedNumber(settings, MODULE_ID, "boost", BOOST_DB, "device"),
    evenness: savedNumber(settings, MODULE_ID, "evenness", EVENNESS, "player"),
  };
}
