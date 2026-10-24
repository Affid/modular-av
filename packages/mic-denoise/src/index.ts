import type { ModularAV } from "@modular-av/api";
import { registerModels } from "./register.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

Hooks.once("modularAV.register", (api: ModularAV) => {
  registerModels(api);
});
