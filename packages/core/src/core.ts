import type {
  AVState,
  Contribution,
  EffectDefinition,
  ModularAV,
  ServiceDefinition,
  SurfaceDefinition,
} from "@modular-av/api";
import { createCommands } from "./commands.ts";
import { validateContribution, validateSurface } from "./contributions.ts";
import { MODULE_ID, SERVICE_SETTING } from "./constants.ts";
import {
  type Controller,
  createController,
  DEAFENED_SETTING,
} from "./controller.ts";
import { createAVClientClass } from "./foundry/av-client.ts";
import {
  type CamerasHosting,
  createCameraHostClass,
} from "./foundry/camera-host.ts";
import type {
  FoundryConfig,
  FoundryGame,
  FoundryHooks,
  FoundryNamespace,
  FoundryUi,
} from "./foundry/globals.ts";
import { EFFECTS_SETTING } from "./media/effect-choices.ts";
import { createMeters } from "./media/meters.ts";
import type { MediaEnv } from "./media/env.ts";
import {
  DEFAULT_SENSITIVITY,
  SENSITIVITY_SETTING,
} from "./media/sensitivity.ts";
import { createRegistry } from "./registry.ts";
import { assetUrl, createChannels } from "./socket.ts";
import { INITIAL_STATE } from "./state/initial.ts";
import { decoratePlayerList, startPlainStatus } from "./status/plain-status.ts";
import { lazyStats } from "./session/lazy-stats.ts";
import { createStore } from "./store.ts";
import { createPipWindows, type WindowsEnv } from "./windows/pip.ts";
import {
  chosenSurface,
  playersSurfaces,
  registerSurfaceSettings,
} from "./surfaces/choice.ts";
import { createPlacement } from "./surfaces/placement.ts";
import { lazyPreviews } from "./media/lazy-previews.ts";
import { MODULES_MENU } from "./modules/menu.ts";
import {
  lazySettingsWindow,
  menuTypeFor,
} from "./foundry/lazy-settings-window.ts";

export const REGISTER_HOOK = "modularAV.register";
/** Foundry's menu for its A/V settings window. */
const FOUNDRY_AV_MENU = "core.webrtc";

/** Foundry's globals and the browser, injected so tests can fake them. */
export interface CoreDeps {
  readonly game: FoundryGame;
  readonly hooks: FoundryHooks;
  readonly config: FoundryConfig;
  readonly foundry: FoundryNamespace;
  readonly ui: () => FoundryUi;
  readonly env: MediaEnv;
  readonly windows: WindowsEnv;
  readonly now: () => number;
  readonly randomId: () => string;
  readonly onError: (error: unknown) => void;
}

export interface InstalledCore {
  readonly api: ModularAV;
  controller(): Controller;
}

const notReady = (): never => {
  throw new Error("Modular A/V is not set up yet (before Foundry's setup)");
};

/** Called in `init`: puts the client class, the dock host and the API in place. */
export function installCore(deps: CoreDeps): InstalledCore {
  const { game, hooks } = deps;
  const mod = game.modules.get(MODULE_ID);
  if (!mod) throw new Error(`Module "${MODULE_ID}" is not installed`);

  const store = createStore<AVState>(INITIAL_STATE, deps.onError);
  const services = createRegistry<ServiceDefinition>("services");
  const effects = createRegistry<EffectDefinition>("effects");
  const surfaces = createRegistry<SurfaceDefinition>(
    "surfaces",
    validateSurface,
  );
  const contributions = createRegistry<Contribution>(
    "contributions",
    validateContribution,
  );
  const channels = createChannels(game.socket, deps.onError);
  let current: Controller | undefined;
  const controller = (): Controller => current ?? notReady();
  let hosting: CamerasHosting | null = null;
  const meters = createMeters({ env: deps.env, onError: deps.onError });
  /** A cameras surface shows the status: the plain one steps aside. */
  let surfaceShowsStatus = false;

  const ClientClass = createAVClientClass(deps.foundry.av.AVClient, controller);
  deps.config.WebRTC.clientClass = ClientClass;
  deps.config.ui.webrtc = createCameraHostClass(
    deps.foundry.applications.apps.av.CameraViews,
    () => hosting,
  );
  game.settings.register(MODULE_ID, SENSITIVITY_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    default: DEFAULT_SENSITIVITY,
  });
  game.settings.register(MODULE_ID, EFFECTS_SETTING, {
    scope: "client",
    config: false,
    type: Array,
    default: [],
  });
  game.settings.register(MODULE_ID, DEAFENED_SETTING, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });

  const api: ModularAV = Object.freeze({
    version: mod.version,
    state: store.view,
    commands: createCommands(game, controller),
    media: Object.freeze({
      attach: (...args: Parameters<Controller["attach"]>) =>
        controller().attach(...args),
    }),
    meters: meters.api,
    preview: lazyPreviews(() =>
      import("./media/preview.ts").then(({ createPreviews }) =>
        createPreviews({ env: deps.env, effects: effects.api }),
      ),
    ),
    windows: Object.freeze({
      pip: createPipWindows(deps.windows, deps.onError),
    }),
    stats: lazyStats(async () =>
      (await import("./session/stats.ts")).createStats({
        connection: () => current?.connection() ?? null,
        inCall: () => current?.connectedUsers() ?? [],
        now: deps.now,
      }),
    ),
    services: services.api,
    effects: effects.api,
    surfaces: surfaces.api,
    contributions: contributions.api,
    socket: (name: string) => channels.channel(name),
    assetUrl: (moduleId: string, path: string) =>
      assetUrl((p) => deps.foundry.utils.getRoute(p), moduleId, path),
  });
  mod.api = api;

  hooks.once("setup", () => {
    const registries = [services, effects, surfaces, contributions];
    for (const registry of registries) registry.open();
    hooks.callAll(REGISTER_HOOK, api);
    for (const registry of registries) registry.close();
    registerServiceSetting(game, services.api.list());
    registerSurfaceSettings(game, surfaces.api.list());
    const placement = createPlacement(
      () => game.webrtc?.settings ?? null,
      deps.ui,
    );
    hosting = {
      surface: chosenSurface(game, surfaces.api.list(), "cameras"),
      placement: placement.get,
      setPlacement: placement.set,
      mounted() {
        surfaceShowsStatus = true;
      },
      failed(error) {
        surfaceShowsStatus = false;
        deps.onError(error);
      },
    };
    current = createController({
      store,
      game,
      hooks,
      env: deps.env,
      channels,
      services: services.api,
      effects: effects.api,
      selectedService: () =>
        String(game.settings.get(MODULE_ID, SERVICE_SETTING)),
      renderDock: () => deps.ui().webrtc?.render(),
      onError: deps.onError,
      now: deps.now,
      randomId: deps.randomId,
    });
    meters.start({
      selfId: game.userId,
      local: current.local,
      remote: current.remote,
    });
    watchFoundry(deps, controller, surfaces.api.list());
  });

  hooks.once("ready", () => {
    installSettingsWindow(deps, surfaces.api.list());
    controller().ready();
    onReady(
      deps,
      controller(),
      {
        store: store.view,
        effects: effects.api,
        quiet: () => surfaceShowsStatus,
      },
      ClientClass,
    );
  });

  return { api, controller };
}

function registerServiceSetting(
  game: FoundryGame,
  services: readonly ServiceDefinition[],
): void {
  game.settings.register(MODULE_ID, SERVICE_SETTING, {
    name: `${MODULE_ID}.settings.service.name`,
    hint: `${MODULE_ID}.settings.service.hint`,
    scope: "world",
    config: true,
    type: String,
    choices: Object.fromEntries(services.map((s) => [s.id, s.label])),
    default: services[0]?.id ?? "",
    requiresReload: true,
  });
}

/** The core's modules window, as its settings menu opens it. */
function openModulesMenu(game: FoundryGame): void {
  const menu = game.settings.menus.get(`${MODULE_ID}.${MODULES_MENU}`);
  if (menu) void new menu.type().render();
}

/**
 * A settings surface replaces Foundry's A/V settings window wherever
 * Foundry opens it: its settings menu and its camera dock's gear
 * (`game.webrtc.config`, made after `setup`).
 */
function installSettingsWindow(
  deps: CoreDeps,
  surfaces: readonly SurfaceDefinition[],
): void {
  const { game } = deps;
  const surface = chosenSurface(game, surfaces, "settings");
  const webrtc = game.webrtc;
  if (!surface || !webrtc) return;
  const foundrySettings = webrtc.config;
  const window = lazySettingsWindow(
    () =>
      import("./foundry/settings-host.ts").then(({ createSettingsWindow }) =>
        createSettingsWindow(deps.foundry.applications.api.ApplicationV2, {
          surface,
          title: game.i18n.localize(`${MODULE_ID}.settingsWindow.title`),
          foundrySettings,
          ...(game.user.isGM
            ? {
                openModules: () => {
                  openModulesMenu(game);
                },
              }
            : {}),
          onError: deps.onError,
        }),
      ),
    foundrySettings,
    deps.onError,
  );
  webrtc.config = window;
  const menu = game.settings.menus.get(FOUNDRY_AV_MENU);
  if (menu)
    game.settings.menus.set(FOUNDRY_AV_MENU, {
      ...menu,
      type: menuTypeFor(window),
    });
}

/** Foundry events that change what the core sends, plays or shows. */
function watchFoundry(
  deps: CoreDeps,
  controller: () => Controller,
  surfaces: readonly SurfaceDefinition[],
): void {
  const { game, hooks } = deps;
  // Rights, names, flags or presence changed: the controller works out
  // what follows (refusing media, rejoining with new rights).
  hooks.on("updateUser", () => {
    controller().apply();
  });
  hooks.on("userConnected", () => {
    controller().apply();
  });
  // Others' mute, hide and speaking reach Foundry's A/V settings here (not
  // their cursors, which come often). Our listener runs before Foundry's,
  // registered later, so the state is rebuilt afterwards.
  game.socket.on("userActivity", (...args: readonly unknown[]) => {
    if (args.some(hasAV))
      queueMicrotask(() => {
        controller().refresh();
      });
  });
  hooks.on("updateSetting", (setting: { key?: unknown }) => {
    if (setting.key === "core.permissions") controller().apply();
  });
  const decorators = playersSurfaces(surfaces);
  hooks.on("renderPlayers", (_app: unknown, element: unknown) => {
    if (!(typeof HTMLElement !== "undefined" && element instanceof HTMLElement))
      return;
    if (decorators.length > 0) {
      decorateWith(decorators, element, deps.onError);
      return;
    }
    decoratePlayerList(
      element,
      controller().store.get(),
      game.i18n.localize(`${MODULE_ID}.status.deafened`),
    );
  });
}

/** Player list surfaces in place of the core's badges; one failing spoils none. */
function decorateWith(
  decorators: readonly { decorate(list: HTMLElement): void }[],
  list: HTMLElement,
  onError: (error: unknown) => void,
): void {
  for (const surface of decorators)
    try {
      surface.decorate(list);
    } catch (error: unknown) {
      onError(error);
    }
}

/** Foundry passes (userId, activity); only A/V activity matters here. */
const hasAV = (arg: unknown): boolean =>
  typeof arg === "object" && arg !== null && "av" in arg;

function onReady(
  deps: CoreDeps,
  controller: Controller,
  {
    store,
    effects,
    quiet,
  }: Pick<ModularAV, "effects"> & {
    readonly store: ModularAV["state"];
    readonly quiet: () => boolean;
  },
  ClientClass: abstract new (...args: never[]) => object,
): void {
  const { game } = deps;
  const ui = deps.ui();
  startPlainStatus({
    store,
    notifications: ui.notifications,
    i18n: game.i18n,
    renderPlayers: () => deps.ui().players?.render(),
    now: deps.now,
    effectKind: (id) => effects.get(id)?.kind,
    quiet,
  });
  if (!game.user.isGM) return;
  const warn = (key: string): void => {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.status.${key}`));
  };
  if (game.webrtc && !(game.webrtc.client instanceof ClientClass))
    warn("clientReplaced");
  const service = controller.service();
  if (service?.canSignTokens && !service.canSignTokens()) warn("gmNeedsSecret");
}
