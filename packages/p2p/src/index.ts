import type { ModularAV } from "@modular-av/api";
import {
  type FoundryGameSlice,
  type FoundryHooksSlice,
  foundryServiceDeps,
  redact,
  relayWithoutTurn,
} from "./foundry.ts";
import { createP2PService } from "./service.ts";
import { MODULE_ID, registerSettings } from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: FoundryGameSlice & {
    readonly i18n: { localize(key: string): string };
  };
  var Hooks: FoundryHooksSlice & {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
  var ui: { readonly notifications: { warn(message: string): void } };
}

const reportError = (error: unknown): void => {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: P2P | ${redact(text)}`);
};

Hooks.once("init", () => {
  registerSettings(game.settings);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  api.services.register(
    createP2PService(
      foundryServiceDeps({
        game,
        hooks: Hooks,
        channel: api.socket("p2p"),
        onError: reportError,
      }),
    ),
  );
});

Hooks.once("ready", () => {
  if (relayWithoutTurn(game))
    ui.notifications.warn(
      game.i18n.localize(`${MODULE_ID}.status.relayWithoutTurn`),
    );
});
