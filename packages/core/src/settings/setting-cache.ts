import type {
  FoundryGame,
  FoundryHooks,
  FoundrySettingConfig,
  FoundrySettings,
} from "../foundry/globals.ts";

/** Foundry's hooks for its Setting documents (player and world settings). */
const DOCUMENT_HOOKS = ["createSetting", "updateSetting", "deleteSetting"];

type OnChange = NonNullable<FoundrySettingConfig["onChange"]>;

const keyOf = (setting: unknown): unknown =>
  typeof setting === "object" && setting !== null && "key" in setting
    ? setting.key
    : undefined;

/** Values by "<namespace>.<key>", kept only for the settings tracked. */
function createValues() {
  let tracked = new Set<string>();
  let values = new Map<string, unknown>();
  const forget = (id: unknown): void => {
    if (typeof id !== "string" || !values.has(id)) return;
    values = new Map([...values].filter(([key]) => key !== id));
  };
  return {
    forget,
    track(id: string): void {
      tracked = new Set(tracked).add(id);
      forget(id);
    },
    read(id: string, load: () => unknown): unknown {
      if (!tracked.has(id)) return load();
      if (values.has(id)) return values.get(id);
      const value = load();
      values = new Map(values).set(id, value);
      return value;
    },
  };
}

/**
 * Foundry's settings, with those registered through this read once until
 * they change. Foundry 14 builds a whole Setting document on each read of
 * a browser setting and searches every Setting document for a player's or
 * the world's, while the core reads its settings on each state rebuild,
 * many times a second in a call.
 *
 * Foundry calls a setting's `onChange` before its hooks say anything, so
 * the value is forgotten in `onChange` first; the hooks also catch what
 * calls no `onChange`, such as a deleted value. A browser setting another
 * tab changes, which Foundry tells nobody about, keeps its old value here
 * until this page changes it or reloads. Values are shared by every
 * reader: never change one in place. Settings registered elsewhere (by
 * Foundry, or by a module on its own) are read from Foundry every time.
 */
export function cachedSettings(
  settings: FoundrySettings,
  hooks: FoundryHooks,
): FoundrySettings {
  const values = createValues();
  hooks.on("clientSettingChanged", values.forget);
  for (const hook of DOCUMENT_HOOKS)
    hooks.on(hook, (setting: unknown) => {
      values.forget(keyOf(setting));
    });
  return Object.freeze({
    menus: settings.menus,
    ...(settings.storage ? { storage: settings.storage } : {}),
    register(namespace, key, config) {
      const id = `${namespace}.${key}`;
      const { onChange } = config;
      settings.register(namespace, key, {
        ...config,
        onChange: (...args: Parameters<OnChange>) => {
          values.forget(id);
          onChange?.(...args);
        },
      });
      values.track(id);
    },
    registerMenu(namespace, key, config) {
      settings.registerMenu(namespace, key, config);
    },
    get: (namespace, key) =>
      values.read(`${namespace}.${key}`, () => settings.get(namespace, key)),
    set: (namespace, key, value) => settings.set(namespace, key, value),
  } satisfies FoundrySettings);
}

/**
 * Foundry's game as the core uses it, live, but with its settings read
 * through `cachedSettings`.
 */
export function withCachedSettings(
  game: FoundryGame,
  hooks: FoundryHooks,
): FoundryGame {
  const settings = cachedSettings(game.settings, hooks);
  return Object.freeze({
    get modules() {
      return game.modules;
    },
    get user() {
      return game.user;
    },
    get userId() {
      return game.userId;
    },
    get users() {
      return game.users;
    },
    settings,
    get socket() {
      return game.socket;
    },
    get i18n() {
      return game.i18n;
    },
    get world() {
      return game.world;
    },
    get ready() {
      return game.ready;
    },
    get webrtc() {
      return game.webrtc;
    },
    // Foundry makes it with the game, before `init`, and never replaces it.
    ...(game.keybindings ? { keybindings: game.keybindings } : {}),
  });
}
