import {
  createClient,
  type FakeClient,
  type FakeModuleData,
} from "./client.ts";
import type { Translations } from "./i18n.ts";
import {
  createSettings,
  type FakeSettingsHandle,
  type SharedSettingsStore,
} from "./settings.ts";
import { createSocketNetwork } from "./socket.ts";
import {
  createUser,
  createUsersView,
  type FakeUser,
  type FakeUserData,
} from "./users.ts";

export interface FakeWorldOptions {
  readonly users: readonly FakeUserData[];
  readonly modules?: readonly FakeModuleData[];
  readonly translations?: Translations;
}

export type UserChanges = Partial<Omit<FakeUserData, "id">>;

/**
 * The server side of a fake Foundry: users, world and user settings, and
 * the socket. Each `connect()` is one browser tab logged in as a user.
 */
export interface FakeWorld {
  connect(userId: string): FakeClient;
  /** As a GM editing a user document; fires `updateUser` on every client. */
  updateUser(userId: string, changes: UserChanges): void;
  /** Waits until every socket message in flight is delivered. */
  settle(): Promise<void>;
  readonly users: readonly FakeUser[];
  /** Errors thrown by socket handlers and setting onChange callbacks. */
  readonly errors: readonly unknown[];
}

interface Connection {
  readonly userId: string;
  readonly client: FakeClient;
  readonly settings: FakeSettingsHandle;
}

export function createFakeWorld(options: FakeWorldOptions): FakeWorld {
  const network = createSocketNetwork();
  let userData = options.users;
  let connections: readonly Connection[] = [];
  let worldValues = new Map<string, string>();
  let userValues = new Map<string, string>();
  let users: readonly FakeUser[] = [];
  let settingErrors: readonly unknown[] = [];

  const isActive = (id: string): boolean =>
    connections.some((c) => c.userId === id);
  const rebuildUsers = (): void => {
    users = userData.map((data) => createUser(data, isActive(data.id)));
  };
  rebuildUsers();
  const usersView = createUsersView(() => users);

  const userChanged = (
    userId: string,
    wasActive: boolean,
    except?: FakeClient,
  ): void => {
    rebuildUsers();
    if (wasActive === isActive(userId)) return;
    const user = usersView.get(userId);
    for (const c of connections) {
      if (c.client !== except)
        c.client.Hooks.callAll("userConnected", user, isActive(userId));
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
      usersView.get(userId)?.hasPermission("SETTINGS_MODIFY") ?? false,
  });

  const connect = (userId: string): FakeClient => {
    if (!userData.some((u) => u.id === userId))
      throw new Error(`unknown user "${userId}"`);
    const wasActive = isActive(userId);
    const { socket, detach } = network.attach(userId);
    let ready = (): boolean => false;
    const settings = createSettings(sharedStore(userId), () => ready());
    const client = createClient({
      userId,
      readUsers: usersView,
      settings: settings.settings,
      socket,
      modules: options.modules ?? [],
      translations: options.translations ?? {},
      onDisconnect: () => {
        if (!connections.some((c) => c.client === client)) return;
        const wasStillActive = isActive(userId);
        detach();
        connections = connections.filter((c) => c.client !== client);
        userChanged(userId, wasStillActive);
      },
    });
    ready = () => client.game.ready;
    connections = [...connections, { userId, client, settings }];
    userChanged(userId, wasActive, client);
    return client;
  };

  return {
    connect,
    updateUser(userId, changes) {
      userData = userData.map((u) =>
        u.id === userId ? { ...u, ...changes } : u,
      );
      rebuildUsers();
      const user = usersView.get(userId);
      for (const c of connections)
        c.client.Hooks.callAll("updateUser", user, changes);
    },
    settle: () => network.settle(),
    get users() {
      return users;
    },
    get errors() {
      return [...network.errors, ...settingErrors];
    },
  };
}
