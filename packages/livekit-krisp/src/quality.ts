import type {
  ChoiceControl,
  ControlContribution,
  Observable,
} from "@modular-av/api";
import type { KrispQuality } from "./krisp.ts";
import {
  MODULE_ID,
  QUALITIES,
  QUALITY_SETTING,
  readQuality,
  type SettingsApi,
} from "./settings.ts";

/** Krisp's effect id, which the control is attached to. */
export const KRISP_EFFECT = "krisp";

export interface QualityControl {
  /** Shown by UIs with the Krisp choice, while Krisp is chosen. */
  readonly control: ChoiceControl & ControlContribution;
  /** Tells the control's listeners the setting changed (its `onChange`). */
  changed(): void;
}

const isQuality = (value: string): value is KrispQuality =>
  QUALITIES.some((q) => q === value);

/**
 * Krisp's model quality as a control attached to Krisp, so it is offered
 * wherever Krisp is picked. It applies the next time Krisp starts.
 */
export function createQualityControl(
  settings: Pick<SettingsApi, "get" | "set">,
): QualityControl {
  let listeners: readonly ((value: string) => void)[] = [];
  const state: Observable<string> = {
    get: () => readQuality(settings),
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
  const control: ChoiceControl & ControlContribution = {
    kind: "control",
    place: "quick",
    effect: KRISP_EFFECT,
    type: "choice",
    id: `${MODULE_ID}.${QUALITY_SETTING}`,
    label: `${MODULE_ID}.settings.quality.name`,
    options: QUALITIES.map((q) => ({
      value: q,
      label: `${MODULE_ID}.settings.quality.choices.${q}`,
    })),
    state,
    async set(value) {
      if (!isQuality(value))
        throw new RangeError(`Krisp has no "${value}" quality`);
      await settings.set(MODULE_ID, QUALITY_SETTING, value);
    },
  };
  return {
    control,
    changed() {
      const value = state.get();
      for (const listener of listeners) listener(value);
    },
  };
}
