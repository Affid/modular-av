import {
  type AVClientSettings,
  type AVWorldSettings,
  DEFAULT_AV_WORLD,
} from "./av-settings.ts";
import {
  type ClientHandle,
  createClient,
  type FakeClient,
  type FakeModuleData,
} from "./client.ts";
import type { Translations } from "./i18n.ts";
import { expandObject, mergeObject, setProperty } from "./objects.ts";
import {
  createSettings,
  type OwnedSetting,
  type FakeSettingsHandle,
  type SharedSettingsStore,
} from "./settings.ts";
import { createSocketNetwork } from "./socket.ts";
import {
  canUpdateUser,
  createUser,
  createUsersView,
  type FakeUser,
  type FakeUserData,
  type UserActions,
  type UserUpdate,
} from "./users.ts";

export interface FakeWorldOptions {
  readonly users: readonly FakeUserData[];
  readonly modules?: readonly FakeModuleData[];
  readonly translations?: Translations;
  readonly world?: { readonly id: string; readonly title: string };
  /** Unlike Foundry (disabled), A/V defaults to audio and video. */
  readonly av?: Partial<AVWorldSettings>;
}

export interface ConnectOptions {
  /** This browser's `core.rtcClientSettings`. */
  readonly av?: Partial<AVClientSettings>;
}

export type UserChanges = Partial<Omit<FakeUserData, "id">>;

/**
 * The server side of a fake Foundry: users, world and user settings, and
 * the socket. Each `connect()` is one browser tab logged in as a user.
 */
export interface FakeWorld {
  connect(userId: string, options?: ConnectOptions): FakeClient;
  /** As a GM editing a user document; fires `updateUser` on every client. */
  updateUser(userId: string, changes: UserChanges): void;
  /** Waits until every socket message in flight is delivered. */
  settle(): Promise<void>;
  /** The server's view: these users cannot act. */
  readonly users: readonly FakeUser[];
  /** Errors thrown by socket handlers and setting onChange callbacks. */
  readonly errors: readonly unknown[];
}

interface Connection {
  readonly userId: string;
  readonly handle: ClientHandle;
  readonly settings: FakeSettingsHandle;
}

const DEFAULT_WORLD = { id: "test-world", title: "Test World" } as const;

export function createFakeWorld(options: FakeWorldOptions): FakeWorld {
  const network = createSocketNetwork();
  let userData = options.users;
  let connections: readonly Connection[] = [];
  let worldValues = new Map<string, string>();
  let userValues = new Map<string, string>();
  let worldAV: AVWorldSettings = { ...DEFAULT_AV_WORLD, ...options.av };
  let settingErrors: readonly unknown[] = [];

  const isActive = (id: string): boolean =>
    connections.some((c) => c.userId === id);
  const dataOf = (id: string): FakeUserData | undefined =>
    userData.find((u) => u.id === id);

  /** Each client sees the same users, bound to act as that client. */
  const bindUsers = (actions?: UserActions): (() => readonly FakeUser[]) => {
    let cache: { data: typeof userData; active: string; users: FakeUser[] } = {
      data: [],
      active: "",
      users: [],
    };
    return () => {
      const active = connections.map((c) => c.userId).join(",");
      if (cache.data !== userData || cache.active !== active) {
        const users = userData.map((d) =>
          createUser(d, isActive(d.id), actions),
        );
        cache = { data: userData, active, users };
      }
      return cache.users;
    };
  };
  const serverUsers = createUsersView(bindUsers());

  const userChanged = (
    userId: string,
    wasActive: boolean,
    except?: FakeClient,
  ): void => {
    if (wasActive === isActive(userId)) return;
    for (const c of connections) {
      const client = c.handle.client;
      if (client !== except)
        client.Hooks.callAll(
          "userConnected",
          client.game.users.get(userId),
          isActive(userId),
        );
    }
  };

  const applyUpdate = (userId: string, changes: UserUpdate): void => {
    userData = userData.map((u) =>
      u.id === userId ? mergeObject(u, changes) : u,
    );
    for (const c of connections) {
      const client = c.handle.client;
      client.Hooks.callAll(
        "updateUser",
        client.game.users.get(userId),
        changes,
      );
    }
  };

  /** World and user values as one client (logged in as `userId`) sees them. */
  const sharedStore = (userId: string): SharedSettingsStore => ({
    read: (scope, key) => {
      const json =
        scope === "world"
          ? worldValues.get(key)
          : userValues.get(`${userId}/${key}`);
      return json === undefined ? undefined : { json };
    },
    write: (scope, key, json) => {
      if (scope === "world") worldValues = new Map(worldValues).set(key, json);
      else userValues = new Map(userValues).set(`${userId}/${key}`, json);
      for (const c of connections) {
        if (scope === "user" && c.userId !== userId) continue;
        try {
          c.settings.notifyChanged(key, json, userId);
        } catch (error: unknown) {
          settingErrors = [...settingErrors, error];
        }
      }
    },
    canWriteWorld: () =>
      serverUsers.get(userId)?.hasPermission("SETTINGS_MODIFY") ?? false,
  });

  const actionsFor = (userId: string): UserActions => ({
    selfId: userId,
    update(target, flat) {
      const actor = dataOf(userId);
      const subject = dataOf(target);
      const changes = expandObject(flat);
      if (!actor || !subject || !canUpdateUser(actor, subject, changes)) {
        return Promise.reject(
          new Error(`User ${userId} may not update User ${target}`),
        );
      }
      applyUpdate(target, changes);
      return Promise.resolve();
    },
    broadcastActivity(activity) {
      const connection = connections.find((c) => c.userId === userId);
      connection?.handle.client.game.socket.emit("userActivity", activity);
    },
  });

  const writeWorldAV = (userId: string, path: string, value: unknown): void => {
    if (!serverUsers.get(userId)?.hasPermission("SETTINGS_MODIFY"))
      throw new Error(`User ${userId} may not modify the world A/V settings`);
    worldAV = setProperty(worldAV, path, value);
    for (const c of connections) c.handle.worldAVChanged(path, value);
  };

  /** Foundry keeps the world's A/V settings as this setting. */
  const worldAVSetting = (userId: string): OwnedSetting => ({
    config: { scope: "world", default: worldAV, config: false, type: Object },
    read: () => worldAV,
    write: (value) => {
      // Like Foundry, only what changed is written and reported.
      const changes = Object.entries(value as Partial<AVWorldSettings>).filter(
        ([path, part]) =>
          JSON.stringify(part) !==
          JSON.stringify(worldAV[path as keyof AVWorldSettings]),
      );
      for (const [path, part] of changes) writeWorldAV(userId, path, part);
    },
  });

  const connect = (
    userId: string,
    connectOptions?: ConnectOptions,
  ): FakeClient => {
    if (!dataOf(userId)) throw new Error(`unknown user "${userId}"`);
    const wasActive = isActive(userId);
    const { socket, detach } = network.attach(userId);
    let ready = (): boolean => false;
    const settings = createSettings(
      sharedStore(userId),
      () => ready(),
      new Map([["core.rtcWorldSettings", worldAVSetting(userId)]]),
    );
    const handle = createClient({
      userId,
      readUsers: createUsersView(bindUsers(actionsFor(userId))),
      settings: settings.settings,
      socket,
      modules: options.modules ?? [],
      translations: options.translations ?? {},
      world: options.world ?? DEFAULT_WORLD,
      avClient: connectOptions?.av ?? {},
      readWorldAV: () => worldAV,
      writeWorldAV: (path, value) => {
        writeWorldAV(userId, path, value);
      },
      onDisconnect: () => {
        if (!connections.some((c) => c.handle === handle)) return;
        const wasStillActive = isActive(userId);
        detach();
        connections = connections.filter((c) => c.handle !== handle);
        userChanged(userId, wasStillActive);
      },
    });
    const client = handle.client;
    ready = () => client.game.ready;
    connections = [...connections, { userId, handle, settings }];
    userChanged(userId, wasActive, client);
    return client;
  };

  return {
    connect,
    updateUser(userId, changes) {
      applyUpdate(userId, changes);
    },
    settle: () => network.settle(),
    get users() {
      return serverUsers.contents;
    },
    get errors() {
      return [...network.errors, ...settingErrors];
    },
  };
}
