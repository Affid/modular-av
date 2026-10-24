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
import { MODULE_ID } from "./constants.ts";
import {
  type Controller,
  createController,
  DEAFENED_SETTING,
} from "./controller.ts";
import { createAVClientClass } from "./foundry/av-client.ts";
import { createCameraHostClass } from "./foundry/camera-host.ts";
import type {
  FoundryConfig,
  FoundryGame,
  FoundryHooks,
  FoundryNamespace,
  FoundryUi,
} from "./foundry/globals.ts";
import { EFFECTS_SETTING } from "./media/effect-choices.ts";
import type { MediaEnv } from "./media/env.ts";
import {
  DEFAULT_SENSITIVITY,
  SENSITIVITY_SETTING,
} from "./media/sensitivity.ts";
import { createRegistry } from "./registry.ts";
import { assetUrl, createChannels } from "./socket.ts";
import { INITIAL_STATE } from "./state/initial.ts";
import { decoratePlayerList, startPlainStatus } from "./status/plain-status.ts";
import { createStore } from "./store.ts";

export const REGISTER_HOOK = "modularAV.register";
export const SERVICE_SETTING = "service";

/** Foundry's globals and the browser, injected so tests can fake them. */
export interface CoreDeps {
  readonly game: FoundryGame;
  readonly hooks: FoundryHooks;
  readonly config: FoundryConfig;
  readonly foundry: FoundryNamespace;
  readonly ui: () => FoundryUi;
  readonly env: MediaEnv;
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

  const ClientClass = createAVClientClass(deps.foundry.av.AVClient, controller);
  deps.config.WebRTC.clientClass = ClientClass;
  deps.config.ui.webrtc = createCameraHostClass(
    deps.foundry.applications.apps.av.CameraViews,
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
    watchFoundry(deps, controller);
  });

  hooks.once("ready", () => {
    controller().ready();
    onReady(
      deps,
      controller(),
      { store: store.view, effects: effects.api },
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

/** Foundry events that change what the core sends, plays or shows. */
function watchFoundry(deps: CoreDeps, controller: () => Controller): void {
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
  hooks.on("renderPlayers", (_app: unknown, element: unknown) => {
    if (!(typeof Element !== "undefined" && element instanceof Element)) return;
    decoratePlayerList(
      element,
      controller().store.get(),
      game.i18n.localize(`${MODULE_ID}.status.deafened`),
    );
  });
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
  }: Pick<ModularAV, "effects"> & {
    readonly store: ModularAV["state"];
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
