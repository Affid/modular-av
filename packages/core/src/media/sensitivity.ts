import type { InputSensitivity } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** How the voice gate opens on this device: a device setting. */
export const SENSITIVITY_SETTING = "inputSensitivity";

export const DEFAULT_SENSITIVITY: InputSensitivity = {
  auto: true,
  threshold: -50,
};

const MIN_THRESHOLD = -100;
const MAX_THRESHOLD = 0;

export const isThreshold = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= MIN_THRESHOLD &&
  value <= MAX_THRESHOLD;

/** The saved sensitivity; the default for anything malformed. */
export function readSensitivity(game: FoundryGame): InputSensitivity {
  const value: unknown = game.settings.get(MODULE_ID, SENSITIVITY_SETTING);
  const saved = (typeof value === "object" && value !== null ? value : {}) as {
    auto?: unknown;
    threshold?: unknown;
  };
  return {
    auto:
      typeof saved.auto === "boolean" ? saved.auto : DEFAULT_SENSITIVITY.auto,
    threshold: isThreshold(saved.threshold)
      ? saved.threshold
      : DEFAULT_SENSITIVITY.threshold,
  };
}
