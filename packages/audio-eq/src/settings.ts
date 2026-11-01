import {
  clientNumber,
  type NumberSetting,
  type SettingsApi,
} from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";

export type Band = "low" | "mid" | "high";

export const BANDS: readonly Band[] = ["low", "mid", "high"];

/** Each band's gain in dB. */
export type EqSettings = Readonly<Record<Band, NumberSetting>>;

export const GAIN = { min: -12, max: 12, value: 0 } as const;

/** Per device: a microphone's character belongs to the machine. */
export function registerSettings(settings: SettingsApi): EqSettings {
  const band = (key: Band): NumberSetting =>
    clientNumber(settings, MODULE_ID, key, GAIN);
  return { low: band("low"), mid: band("mid"), high: band("high") };
}
