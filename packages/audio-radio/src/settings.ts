import {
  clientNumber,
  type NumberSetting,
  type SettingsApi,
} from "@modular-av/kit";
import { MODULE_ID } from "./constants.ts";

export type Knob = "drive" | "static" | "squelch";

export const KNOBS: readonly Knob[] = ["drive", "static", "squelch"];

/** Each 0 to 1. */
export type RadioSettings = Readonly<Record<Knob, NumberSetting>>;

const STARTS: Readonly<Record<Knob, number>> = {
  drive: 0.5,
  static: 0.3,
  squelch: 0.5,
};

/** Per device, as a player sets it up for one voice. */
export function registerSettings(settings: SettingsApi): RadioSettings {
  const knob = (key: Knob): NumberSetting =>
    clientNumber(settings, MODULE_ID, key, {
      min: 0,
      max: 1,
      value: STARTS[key],
    });
  return {
    drive: knob("drive"),
    static: knob("static"),
    squelch: knob("squelch"),
  };
}
