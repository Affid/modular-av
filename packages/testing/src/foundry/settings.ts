export type SettingScope = "world" | "user" | "client";

const SCOPES: readonly SettingScope[] = ["world", "user", "client"];

export interface FakeSettingConfig {
  readonly scope: SettingScope;
  readonly default: unknown;
  readonly name?: string;
  readonly hint?: string;
  readonly config?: boolean;
  readonly type?: unknown;
  readonly onChange?: (value: unknown) => void;
}

/** Where world and user values live: shared by every client of a world. */
export interface SharedSettingsStore {
  read(
    scope: "world" | "user",
    key: string,
  ): { readonly value: unknown } | undefined;
  /** Stores the value and notifies every client that should see it. */
  write(scope: "world" | "user", key: string, value: unknown): void;
  canWriteWorld(): boolean;
}

export interface FakeSettings {
  register(namespace: string, key: string, config: FakeSettingConfig): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
}

export interface FakeSettingsHandle {
  readonly settings: FakeSettings;
  /** Called by the world when a shared value changed. */
  notifyChanged(key: string, value: unknown): void;
}

export function createSettings(
  shared: SharedSettingsStore,
): FakeSettingsHandle {
  let configs = new Map<string, FakeSettingConfig>();
  let clientValues = new Map<string, unknown>();

  const configFor = (key: string): FakeSettingConfig => {
    const config = configs.get(key);
    if (!config) throw new Error(`"${key}" is not a registered game setting`);
    return config;
  };

  const notifyChanged = (key: string, value: unknown): void => {
    configs.get(key)?.onChange?.(structuredClone(value));
  };

  const settings: FakeSettings = {
    register(namespace, key, config) {
      if (!SCOPES.includes(config.scope)) {
        throw new Error(`Invalid setting scope "${config.scope}"`);
      }
      configs = new Map(configs).set(`${namespace}.${key}`, config);
    },

    get(namespace, key) {
      const fullKey = `${namespace}.${key}`;
      const { scope, default: fallback } = configFor(fullKey);
      const stored =
        scope === "client"
          ? clientValues.has(fullKey)
            ? { value: clientValues.get(fullKey) }
            : undefined
          : shared.read(scope, fullKey);
      return structuredClone(stored ? stored.value : fallback);
    },

    set(namespace, key, value) {
      const fullKey = `${namespace}.${key}`;
      try {
        const { scope } = configFor(fullKey);
        const copy = structuredClone(value);
        if (scope === "client") {
          clientValues = new Map(clientValues).set(fullKey, copy);
          notifyChanged(fullKey, copy);
        } else {
          if (scope === "world" && !shared.canWriteWorld()) {
            throw new Error(
              `You do not have permission to modify the world setting "${fullKey}"`,
            );
          }
          shared.write(scope, fullKey, copy);
        }
        return Promise.resolve(structuredClone(copy));
      } catch (error: unknown) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  };

  return { settings, notifyChanged };
}
