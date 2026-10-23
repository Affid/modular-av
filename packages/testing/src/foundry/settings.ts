export type SettingScope = "world" | "user" | "client";

const SCOPES: readonly SettingScope[] = ["world", "user", "client"];

/** Foundry calls `onChange(value, options, userId)`; userId only for stored documents. */
export type SettingOnChange = (
  value: unknown,
  options: object,
  userId?: string,
) => void;

export interface FakeSettingConfig {
  readonly scope: SettingScope;
  readonly default: unknown;
  readonly name?: string;
  readonly hint?: string;
  readonly config?: boolean;
  readonly type?: unknown;
  readonly onChange?: SettingOnChange;
}

/** Where world and user values live: shared by every client of a world. */
export interface SharedSettingsStore {
  read(
    scope: "world" | "user",
    key: string,
  ): { readonly json: string } | undefined;
  /** Stores the value and notifies every client that should see it. */
  write(scope: "world" | "user", key: string, json: string): void;
  canWriteWorld(): boolean;
}

export interface FakeSettings {
  register(namespace: string, key: string, config: FakeSettingConfig): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
}

export interface FakeSettingsHandle {
  readonly settings: FakeSettings;
  /** Called by the world when a shared value changed; may throw. */
  notifyChanged(key: string, json: string, userId: string): void;
}

/** Values are stored as JSON, as Foundry's Setting documents do. */
const toJson = (value: unknown): string => {
  // JSON.stringify returns undefined for undefined; Foundry stores null.
  const json = JSON.stringify(value) as string | undefined;
  return json ?? "null";
};
const fromJson = (json: string): unknown => JSON.parse(json);

export function createSettings(
  shared: SharedSettingsStore,
  isReady: () => boolean,
): FakeSettingsHandle {
  let configs = new Map<string, FakeSettingConfig>();
  let clientValues = new Map<string, string>();

  const configFor = (key: string): FakeSettingConfig => {
    const config = configs.get(key);
    if (!config) throw new Error(`"${key}" is not a registered game setting`);
    return config;
  };

  const storedJson = (scope: SettingScope, key: string): string | undefined =>
    scope === "client" ? clientValues.get(key) : shared.read(scope, key)?.json;

  const write = (
    key: string,
    config: FakeSettingConfig,
    json: string,
  ): void => {
    if (config.scope === "client") {
      clientValues = new Map(clientValues).set(key, json);
      config.onChange?.(fromJson(json), {});
      return;
    }
    if (!isReady()) {
      throw new Error(
        "You may not set a World-level Setting before the Game is ready.",
      );
    }
    if (config.scope === "world" && !shared.canWriteWorld()) {
      throw new Error(
        `You do not have permission to modify the world setting "${key}"`,
      );
    }
    shared.write(config.scope, key, json);
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
      const config = configFor(fullKey);
      const json = storedJson(config.scope, fullKey);
      return json === undefined
        ? structuredClone(config.default)
        : fromJson(json);
    },

    set(namespace, key, value) {
      const fullKey = `${namespace}.${key}`;
      try {
        const config = configFor(fullKey);
        const json = toJson(value);
        // Like Foundry, an unchanged value is not written and fires no onChange.
        if (storedJson(config.scope, fullKey) !== json)
          write(fullKey, config, json);
        return Promise.resolve(fromJson(json));
      } catch (error: unknown) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  };

  return {
    settings,
    notifyChanged(key, json, userId) {
      configs.get(key)?.onChange?.(fromJson(json), {}, userId);
    },
  };
}
