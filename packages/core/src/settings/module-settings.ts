import type {
  ModuleSetting,
  ModuleSettings,
  SettingStorage,
} from "@modular-av/api";
import { AVCommandError } from "../errors.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** Foundry's scope for each storage. */
const SCOPES: Readonly<Record<SettingStorage, "user" | "client">> = {
  player: "user",
  device: "client",
};

export interface CoreModuleSettings extends ModuleSettings {
  /** The "<module>.<key>" of every player setting, to move from the browser. */
  playerSettings(): readonly string[];
  /** The game is ready: player settings may be saved from now on. */
  ready(): void;
}

const isName = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && !value.includes(".");

function check(module: string, key: string, setting: ModuleSetting): void {
  if (!isName(module) || !isName(key))
    throw new AVCommandError(
      "invalid-argument",
      "A setting needs its module's id and a key, without dots",
      { module, key },
    );
  if (!Object.hasOwn(SCOPES, setting.storage))
    throw new AVCommandError(
      "invalid-argument",
      'A setting is kept for the "player" or the "device"',
      { storage: setting.storage },
    );
}

/**
 * Modules' settings, the core's own too, registered with Foundry in the
 * scope their storage names. Saves of one setting run one at a time, and a
 * player setting's wait for the game to be ready (Foundry refuses before).
 */
export function createModuleSettings(game: FoundryGame): CoreModuleSettings {
  let storages = new Map<string, SettingStorage>();
  let queues = new Map<string, Promise<unknown>>();
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  if (game.ready) markReady();

  return Object.freeze({
    register(module: string, key: string, setting: ModuleSetting) {
      check(module, key, setting);
      const { onChange } = setting;
      game.settings.register(module, key, {
        scope: SCOPES[setting.storage],
        config: false,
        type: setting.type,
        default: setting.default,
        ...(onChange
          ? {
              onChange: (value: unknown) => {
                onChange(value);
              },
            }
          : {}),
      });
      storages = new Map(storages).set(`${module}.${key}`, setting.storage);
    },
    get: (module: string, key: string) => game.settings.get(module, key),
    set(module: string, key: string, value: unknown) {
      const id = `${module}.${key}`;
      const player = storages.get(id) === "player";
      const run = (queues.get(id) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          if (player) await ready;
          await game.settings.set(module, key, value);
        });
      queues = new Map(queues).set(id, run);
      return run.then(() => undefined);
    },
    storageOf: (module: string, key: string) =>
      storages.get(`${module}.${key}`) ?? null,
    playerSettings: () =>
      [...storages].filter(([, s]) => s === "player").map(([id]) => id),
    ready: () => {
      markReady();
    },
  });
}
