import {
  savedNumber,
  type NumberSetting,
  type StoredSettings,
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

/** The player's: they follow them to another browser or address. */
export function registerSettings(settings: StoredSettings): EchoSettings {
  return {
    time: savedNumber(settings, MODULE_ID, "time", TIME, "player"),
    decay: savedNumber(settings, MODULE_ID, "decay", DECAY, "player"),
  };
}
