import {
  savedNumber,
  type NumberSetting,
  type StoredSettings,
} from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";

export type Band = "low" | "mid" | "high";

export const BANDS: readonly Band[] = ["low", "mid", "high"];

/** Each band's gain in dB. */
export type EqSettings = Readonly<Record<Band, NumberSetting>>;

export const GAIN = { min: -12, max: 12, value: 0 } as const;

/** The player's: they follow them to another browser or address. */
export function registerSettings(settings: StoredSettings): EqSettings {
  const band = (key: Band): NumberSetting =>
    savedNumber(settings, MODULE_ID, key, GAIN, "player");
  return { low: band("low"), mid: band("mid"), high: band("high") };
}
