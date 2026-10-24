import { FakeApplicationV2, FakeAVConfig } from "./application.ts";
import {
  FakeAVClient,
  FakeCameraViews,
  FakeDefaultAVClient,
} from "./av-classes.ts";
import { type AVClientClass, FakeAVMaster } from "./av-master.ts";
import {
  AV_MODES,
  type AVClientSettings,
  type AVWorldSettings,
  createAVSettings,
  type FakeAVSettingsHandle,
} from "./av-settings.ts";
import { createHooks, type FakeHooks } from "./hooks.ts";
import { createI18n, type FakeI18n, type Translations } from "./i18n.ts";
import type { FakeSettings } from "./settings.ts";
import type { FakeSocket } from "./socket.ts";
import type { FakeUser, FakeUsers } from "./users.ts";

export interface FakeModuleData {
  readonly id: string;
  readonly version: string;
  readonly title?: string;
  readonly active?: boolean;
}

/** Mutable like Foundry's: a module sets `api` on itself. */
export interface FakeModule {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  readonly active: boolean;
  api?: unknown;
}

export interface FakeGame {
  readonly user: FakeUser;
  readonly userId: string;
  readonly users: FakeUsers;
  readonly settings: FakeSettings;
  readonly socket: FakeSocket;
  readonly modules: ReadonlyMap<string, FakeModule>;
  readonly i18n: FakeI18n;
  readonly world: { readonly id: string; readonly title: string };
  readonly ready: boolean;
  /** Created between `setup` and `ready`, as `game.initializeRTC` does. */
  readonly webrtc: FakeAVMaster | null;
}

export interface FakeConfig {
  WebRTC: { clientClass: AVClientClass; [key: string]: unknown };
  ui: { webrtc: new () => FakeCameraViews; [key: string]: unknown };
  [key: string]: unknown;
}

export interface Notification {
  readonly type: "info" | "warn" | "error";
  readonly message: string;
}

type Notify = (message: string) => Notification;

export interface FakeUi {
  readonly notifications: { info: Notify; warn: Notify; error: Notify };
  /** Created after `setup` from `CONFIG.ui.webrtc`. */
  webrtc: FakeCameraViews | null;
}

/** The `foundry` namespace, as far as A/V subclasses need it. */
export const FOUNDRY_NAMESPACE = Object.freeze({
  av: Object.freeze({
    AVClient: FakeAVClient,
    AVSettings: Object.freeze({ AV_MODES }),
  }),
  applications: Object.freeze({
    api: Object.freeze({ ApplicationV2: FakeApplicationV2 }),
    settings: Object.freeze({
      menus: Object.freeze({ AVConfig: FakeAVConfig }),
    }),
    apps: Object.freeze({
      av: Object.freeze({ CameraViews: FakeCameraViews }),
    }),
  }),
  utils: Object.freeze({
    /** Foundry adds its route prefix; the fake world has none. */
    getRoute: (path: string) => `/${path.replace(/^\/+/, "")}`,
  }),
});

export interface FakeClient {
  readonly game: FakeGame;
  readonly Hooks: FakeHooks;
  readonly CONFIG: FakeConfig;
  readonly ui: FakeUi;
  readonly foundry: typeof FOUNDRY_NAMESPACE;
  readonly notifications: readonly Notification[];
  /** Rejections nobody awaited, such as `game.webrtc.connect()` at startup. */
  readonly errors: readonly unknown[];
  /** Puts `game`, `Hooks`, `CONFIG`, `ui` and `foundry` on `target`; returns an undo. */
  install(target?: object): () => void;
  /**
   * Runs Foundry's startup: `init`, `setup`, then `game.webrtc` (connect
   * started, not awaited) and `ui.webrtc`, then `ready`.
   */
  runLifecycle(): void;
  disconnect(): void;
}

export interface ClientParts {
  readonly userId: string;
  readonly readUsers: FakeUsers;
  readonly settings: FakeSettings;
  readonly socket: FakeSocket;
  readonly modules: readonly FakeModuleData[];
  readonly translations: Translations;
  readonly world: { readonly id: string; readonly title: string };
  readonly avClient: Partial<AVClientSettings>;
  readWorldAV(): AVWorldSettings;
  /** Throws unless this client's user may write world settings. */
  writeWorldAV(path: string, value: unknown): void;
  readonly onDisconnect: () => void;
}

const GLOBAL_NAMES = ["game", "Hooks", "CONFIG", "ui", "foundry"] as const;

/** The socket event Foundry's server relays user activity on. */
export const USER_ACTIVITY_EVENT = "userActivity";

export interface ClientHandle {
  readonly client: FakeClient;
  /** The shared A/V world settings changed. */
  worldAVChanged(path: string, value: unknown): void;
}

function createModules(
  data: readonly FakeModuleData[],
): ReadonlyMap<string, FakeModule> {
  return new Map<string, FakeModule>(
    data.map((m) => [
      m.id,
      {
        id: m.id,
        title: m.title ?? m.id,
        version: m.version,
        active: m.active ?? true,
      },
    ]),
  );
}

export function createClient(parts: ClientParts): ClientHandle {
  const hooks = createHooks();
  let ready = false;
  let webrtc: FakeAVMaster | null = null;
  let avSettings: FakeAVSettingsHandle | null = null;
  let notifications: readonly Notification[] = [];
  let errors: readonly unknown[] = [];

  const notify =
    (type: Notification["type"]): Notify =>
    (message) => {
      const entry = { type, message };
      notifications = [...notifications, entry];
      return entry;
    };

  const game: FakeGame = {
    get user() {
      const user = parts.readUsers.get(parts.userId);
      if (!user) throw new Error(`User ${parts.userId} no longer exists`);
      return user;
    },
    userId: parts.userId,
    users: parts.readUsers,
    settings: parts.settings,
    socket: parts.socket,
    modules: createModules(parts.modules),
    i18n: createI18n(parts.translations),
    world: parts.world,
    get ready() {
      return ready;
    },
    get webrtc() {
      return webrtc;
    },
  };

  const ui: FakeUi = {
    notifications: {
      info: notify("info"),
      warn: notify("warn"),
      error: notify("error"),
    },
    webrtc: null,
  };

  parts.socket.on(USER_ACTIVITY_EVENT, (data, senderId) => {
    const av = (data as { av?: object } | null)?.av;
    if (av) avSettings?.settings.handleUserActivity(senderId, av);
  });

  const initializeRTC = (clientClass: AVClientClass): void => {
    avSettings = createAVSettings({
      selfId: parts.userId,
      users: parts.readUsers,
      client: parts.avClient,
      readWorld: () => parts.readWorldAV(),
      writeWorld: (path, value) => {
        parts.writeWorldAV(path, value);
      },
      avClient: () => webrtc?.client ?? null,
      onChanged: (changed) => webrtc?.onSettingsChanged(changed),
      cameraViews: () => ui.webrtc,
    });
    webrtc = new FakeAVMaster({
      selfId: parts.userId,
      settings: avSettings.settings,
      clientClass,
      cameraViews: () => ui.webrtc,
      broadcastActivity: (activity) => {
        parts.socket.emit(USER_ACTIVITY_EVENT, activity);
      },
    });
    webrtc.connect().catch((error: unknown) => {
      errors = [...errors, error];
    });
  };

  const client: FakeClient = {
    game,
    Hooks: hooks,
    CONFIG: {
      WebRTC: { clientClass: FakeDefaultAVClient },
      ui: { webrtc: FakeCameraViews },
    },
    ui,
    foundry: FOUNDRY_NAMESPACE,
    get notifications() {
      return notifications;
    },
    get errors() {
      return errors;
    },
    install(target: object = globalThis) {
      const slots = target as Record<string, unknown>;
      const saved = GLOBAL_NAMES.map(
        (name) => [name, name in slots, slots[name]] as const,
      );
      for (const name of GLOBAL_NAMES) slots[name] = client[name];
      return () => {
        for (const [name, existed, value] of saved) {
          if (existed) slots[name] = value;
          else Reflect.deleteProperty(slots, name);
        }
      };
    },
    runLifecycle() {
      hooks.callAll("init");
      hooks.callAll("setup");
      initializeRTC(client.CONFIG.WebRTC.clientClass);
      ui.webrtc = new client.CONFIG.ui.webrtc();
      // Foundry's initializeUI renders the camera dock without awaiting it.
      ui.webrtc.render({ force: true }).catch((error: unknown) => {
        errors = [...errors, error];
      });
      ready = true;
      hooks.callAll("ready");
    },
    disconnect: parts.onDisconnect,
  };
  return {
    client,
    worldAVChanged(path, value) {
      avSettings?.worldChanged(path, value);
    },
  };
}
