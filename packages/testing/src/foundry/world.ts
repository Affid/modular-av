import {
  createClient,
  type FakeClient,
  type FakeModuleData,
} from "./client.ts";
import type { Translations } from "./i18n.ts";
import { createSettings, type FakeSettingsHandle } from "./settings.ts";
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
  let worldValues = new Map<string, unknown>();
  let userValues = new Map<string, unknown>();
  let users: readonly FakeUser[] = [];

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

  const connect = (userId: string): FakeClient => {
    if (!userData.some((u) => u.id === userId))
      throw new Error(`unknown user "${userId}"`);
    const wasActive = isActive(userId);
    const { socket, detach } = network.attach(userId);
    const settings = createSettings({
      read: (scope, key) => {
        const map = scope === "world" ? worldValues : userValues;
        const fullKey = scope === "world" ? key : `${userId}/${key}`;
        return map.has(fullKey) ? { value: map.get(fullKey) } : undefined;
      },
      write: (scope, key, value) => {
        if (scope === "world")
          worldValues = new Map(worldValues).set(key, value);
        else userValues = new Map(userValues).set(`${userId}/${key}`, value);
        for (const c of connections) {
          if (scope === "world" || c.userId === userId)
            c.settings.notifyChanged(key, value);
        }
      },
      canWriteWorld: () =>
        usersView.get(userId)?.hasPermission("SETTINGS_MODIFY") ?? false,
    });
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
  };
}
