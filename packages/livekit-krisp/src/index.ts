import type { ModularAV, Observable } from "@modular-av/api";
import type { LiveKitModuleApi } from "@modular-av/livekit/api";
import { createKrispDefinition, krispSection } from "./definition.ts";
import { createKrispLoader } from "./loader.ts";
import { readQuality, registerSettings, type SettingsApi } from "./settings.ts";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: {
    settings: SettingsApi;
    modules: { get(id: string): { api?: unknown } | undefined };
  };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
  };
}

/** modular-av-livekit's own API, set in its `init` hook. */
function liveKitRoom(): Observable<object | null> | null {
  const api = game.modules.get("modular-av-livekit")?.api as
    Partial<LiveKitModuleApi> | undefined;
  return api?.room ?? null;
}

Hooks.once("init", () => {
  registerSettings(game.settings);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  const room = liveKitRoom();
  // Without the LiveKit module (disabled), Krisp has no room to run in.
  if (!room) return;
  api.effects.register(
    createKrispDefinition({
      load: createKrispLoader(),
      room,
      quality: () => readQuality(game.settings),
    }),
  );
  api.contributions.register(krispSection);
});
