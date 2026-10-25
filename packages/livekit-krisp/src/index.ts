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

/** As modular-av-livekit's log: Krisp works with the room's join token. */
const redact = (text: string): string =>
  text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[token]")
    .replace(/((?:access_)?token=)[^&\s"']+/gi, "$1[token]");

const reportError = (error: unknown): void => {
  const text = redact(error instanceof Error ? error.message : String(error));
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: Krisp | ${text}`);
};

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
      onError: reportError,
    }),
  );
  api.contributions.register(krispSection);
});
