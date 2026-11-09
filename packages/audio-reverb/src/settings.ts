import {
  savedNumber,
  type NumberSetting,
  type StoredSettings,
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

/** The player's: they follow them to another browser or address. */
export function registerSettings(settings: StoredSettings): ReverbSettings {
  return {
    decay: savedNumber(settings, MODULE_ID, "decay", DECAY, "player"),
    brightness: savedNumber(
      settings,
      MODULE_ID,
      "brightness",
      BRIGHTNESS,
      "player",
    ),
  };
}
