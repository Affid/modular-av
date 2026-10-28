import type { ModularAV } from "@modular-av/api";
import { camerasSurface } from "./cameras/dock.ts";
import { createContext, type DockGame, MODULE_ID } from "./context.ts";
import { importLegacy } from "./legacy.ts";
import { reportError } from "./log.ts";
import { playersSurface } from "./players/decorate.ts";
import { registerSettings } from "./settings.ts";
import { settingsSurface } from "./settings-window/surface.ts";
import type { Themes } from "./themes/choice.ts";
import { dockApiOf, startThemes } from "./themes/install.ts";
import { createThemeRegistry } from "./themes/registry.ts";
import "../styles/dock.css";

/** The slice of Foundry's globals this module uses. */
declare global {
  var game: DockGame & {
    readonly webrtc?: {
      readonly config: { render(options?: object): unknown };
    } | null;
    readonly modules: {
      get(id: string): { api?: unknown } | undefined;
    };
    readonly socket: { emit(event: string): void };
  };
  var Hooks: {
    once(hook: string, fn: (...args: never[]) => void): number;
    on(hook: string, fn: (...args: never[]) => void): number;
    off(hook: string, id: number): void;
    callAll(hook: string, ...args: unknown[]): boolean;
  };
  var foundry: {
    readonly utils: { getRoute(path: string): string; debouncedReload(): void };
  };
}

const themeRegistry = createThemeRegistry();
const dockApi = dockApiOf(themeRegistry);
/** Known once the core's register hook ran (Foundry's `setup`). */
let themes: Themes | null = null;

/** A scene update that changes what the scattered layout shows. */
const showsChange = (changes: {
  readonly active?: unknown;
  readonly flags?: Readonly<Record<string, unknown>>;
}): boolean =>
  changes.active !== undefined || changes.flags?.[MODULE_ID] !== undefined;

/** The viewed scene changed (`canvasReady`), or a scene's layout or activity. */
function onSceneChange(listener: () => void): () => void {
  const hooks = [
    [
      "canvasReady",
      Hooks.on("canvasReady", () => {
        listener();
      }),
    ],
    [
      "updateScene",
      Hooks.on("updateScene", (_scene: unknown, changes: object) => {
        if (showsChange(changes)) listener();
      }),
    ],
  ] as const;
  return () => {
    for (const [hook, id] of hooks) Hooks.off(hook, id);
  };
}

const IMPORTED = "legacyImported";

Hooks.once("init", () => {
  registerSettings(game.settings, () => {
    themes?.changed();
  });
  // Theme modules may also reach the API through Foundry's module list.
  const own = game.modules.get(MODULE_ID);
  if (own) own.api = dockApi;
  game.settings.register(MODULE_ID, IMPORTED, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
});

// A player's dock from LiveKit AVClient, once (see legacy.ts).
Hooks.once("ready", () => {
  importLegacy({
    storage: localStorage,
    imported: () => game.settings.get(MODULE_ID, IMPORTED) === true,
    markImported: async (value) => {
      await game.settings.set(MODULE_ID, IMPORTED, value);
    },
    set: async (key, value) => {
      await game.settings.set(MODULE_ID, key, value);
    },
  }).catch(reportError);
});

Hooks.once("modularAV.register", (api: ModularAV) => {
  themes = startThemes(
    {
      settings: game.settings,
      callAll: (hook, dock) => Hooks.callAll(hook, dock),
      route: (path) => foundry.utils.getRoute(path),
      doc: document,
    },
    themeRegistry,
    dockApi,
  );
  const ctx = createContext({
    themes,
    game,
    api,
    // The core's settings window, or Foundry's if another module's is chosen.
    openSettings: () => {
      game.webrtc?.config.render({ force: true });
    },
    // As Foundry's module settings do for a setting that needs it.
    reload: (everyone) => {
      if (everyone) game.socket.emit("reload");
      foundry.utils.debouncedReload();
    },
    onError: reportError,
    onSceneChange,
  });
  api.surfaces.register(camerasSurface(ctx));
  api.surfaces.register(settingsSurface(ctx));
  api.surfaces.register(playersSurface(ctx));
});
