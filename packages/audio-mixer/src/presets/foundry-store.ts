import { MODULE_ID } from "../constants.ts";
import type { PresetStore } from "./presets.ts";

export const ACTIVE_SETTING = "activePreset";
const FLAG = "presets";

export interface FoundryUser {
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  unsetFlag(scope: string, key: string): Promise<unknown>;
}

export interface PresetStoreDeps {
  user(): FoundryUser;
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): Promise<unknown>;
  /** This user's document changed, here or on another of their clients. */
  onUserChange(listener: () => void): () => void;
}

/**
 * On the player's own User, so presets follow them to any device. One key per
 * preset, each one JSON string: Foundry merges objects inside flags, so a key
 * removed from an object would survive. Which is active is per device.
 */
export function foundryPresetStore(deps: PresetStoreDeps): PresetStore {
  return {
    read() {
      const saved = deps.user().getFlag(MODULE_ID, FLAG);
      return typeof saved === "object" && saved !== null
        ? (saved as Readonly<Record<string, unknown>>)
        : {};
    },
    async write(id, json) {
      await deps.user().setFlag(MODULE_ID, `${FLAG}.${id}`, json);
    },
    async remove(id) {
      await deps.user().unsetFlag(MODULE_ID, `${FLAG}.${id}`);
    },
    activeId() {
      const id = deps.getSetting(ACTIVE_SETTING);
      return typeof id === "string" ? id : "";
    },
    async setActiveId(id) {
      await deps.setSetting(ACTIVE_SETTING, id);
    },
    subscribe: (listener) => deps.onUserChange(listener),
  };
}
