import {
  savedNumber,
  type NumberSetting,
  type StoredSettings,
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

/** The player's: they follow them to another browser or address. */
export function registerSettings(settings: StoredSettings): RadioSettings {
  const knob = (key: Knob): NumberSetting =>
    savedNumber(
      settings,
      MODULE_ID,
      key,
      {
        min: 0,
        max: 1,
        value: STARTS[key],
      },
      "player",
    );
  return {
    drive: knob("drive"),
    static: knob("static"),
    squelch: knob("squelch"),
  };
}
