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
  readonly ready: boolean;
}

export interface FakeConfig {
  WebRTC: Record<string, unknown>;
  ui: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Notification {
  readonly type: "info" | "warn" | "error";
  readonly message: string;
}

type Notify = (message: string) => Notification;

export interface FakeUi {
  readonly notifications: { info: Notify; warn: Notify; error: Notify };
}

export interface FakeClient {
  readonly game: FakeGame;
  readonly Hooks: FakeHooks;
  readonly CONFIG: FakeConfig;
  readonly ui: FakeUi;
  readonly notifications: readonly Notification[];
  /** Puts `game`, `Hooks`, `CONFIG` and `ui` on `target`; returns an undo. */
  install(target?: object): () => void;
  /** Calls `init`, `setup` and `ready` as Foundry does at startup. */
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
  readonly onDisconnect: () => void;
}

const GLOBAL_NAMES = ["game", "Hooks", "CONFIG", "ui"] as const;

export function createClient(parts: ClientParts): FakeClient {
  const hooks = createHooks();
  let ready = false;
  let notifications: readonly Notification[] = [];

  const notify =
    (type: Notification["type"]): Notify =>
    (message) => {
      const entry = { type, message };
      notifications = [...notifications, entry];
      return entry;
    };

  const modules = new Map<string, FakeModule>(
    parts.modules.map((m) => [
      m.id,
      {
        id: m.id,
        title: m.title ?? m.id,
        version: m.version,
        active: m.active ?? true,
      },
    ]),
  );

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
    modules,
    i18n: createI18n(parts.translations),
    get ready() {
      return ready;
    },
  };

  const client: FakeClient = {
    game,
    Hooks: hooks,
    CONFIG: { WebRTC: {}, ui: {} },
    ui: {
      notifications: {
        info: notify("info"),
        warn: notify("warn"),
        error: notify("error"),
      },
    },
    get notifications() {
      return notifications;
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
      ready = true;
      hooks.callAll("ready");
    },
    disconnect: parts.onDisconnect,
  };
  return client;
}
