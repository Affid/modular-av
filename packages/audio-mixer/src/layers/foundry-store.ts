import {
  KEPT_OUT_SETTING,
  MODULE_ID,
  PERSONAL_LAYER_FLAG,
  REFUSED_SETTING,
  TABLE_LAYER_SETTING,
  UNDO_SETTING,
} from "../constants.ts";
import type { ModuleSettings } from "@modular-av/api";
import type { GmLayerStore } from "./gm-layers.ts";
import type { LayerStore } from "./layers.ts";

const get = (key: string): unknown => game.settings.get(MODULE_ID, key);

async function set(key: string, value: unknown): Promise<void> {
  await game.settings.set(MODULE_ID, key, value);
}

function parseRefused(stored: unknown): readonly string[] {
  if (typeof stored !== "string") return [];
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    // Not what this module wrote.
    return [];
  }
}

/**
 * This player's part: a layer's flag, and their undo record and refusals,
 * saved through the core's settings (one at a time, once ready).
 */
export const foundryLayerStore = (
  settings: Pick<ModuleSettings, "set">,
): LayerStore => {
  const save = (key: string, value: unknown): Promise<void> =>
    settings.set(MODULE_ID, key, value);
  return {
    table: () => get(TABLE_LAYER_SETTING),
    personal: () => game.user.getFlag(MODULE_ID, PERSONAL_LAYER_FLAG),
    undo: () => get(UNDO_SETTING),
    setUndo: (json) => save(UNDO_SETTING, json),
    refused: () => parseRefused(get(REFUSED_SETTING)),
    setRefused: (ids) => save(REFUSED_SETTING, JSON.stringify(ids)),
    keptOut: () => get(KEPT_OUT_SETTING) === true,
    setKeptOut: (out) => save(KEPT_OUT_SETTING, out),
  };
};

/** A GM's part: a world setting, and flags on other users. */
export const foundryGmStore = (): GmLayerStore => ({
  table: () => get(TABLE_LAYER_SETTING),
  setTable: (json) => set(TABLE_LAYER_SETTING, json),
  personal: (user) =>
    game.users.get(user)?.getFlag(MODULE_ID, PERSONAL_LAYER_FLAG),
  async setPersonal(user, json) {
    const target = game.users.get(user);
    if (!target) throw new Error(`No user ${user}`);
    await (json === null
      ? target.unsetFlag(MODULE_ID, PERSONAL_LAYER_FLAG)
      : target.setFlag(MODULE_ID, PERSONAL_LAYER_FLAG, json));
  },
});
