import type { ModularAV } from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";
import type { FoundryGame } from "./foundry/globals.ts";

/** Puts the frozen API on the core's module entry and returns it. */
export function installApi(foundryGame: FoundryGame): ModularAV {
  const mod = foundryGame.modules.get(MODULE_ID);
  if (!mod) throw new Error(`Module "${MODULE_ID}" is not installed`);
  const api: ModularAV = Object.freeze({ version: mod.version });
  mod.api = api;
  return api;
}
