/**
 * Where a module's setting is kept, so a player's setup follows them.
 *
 * - `"player"`: on the Foundry server with the player's login (Foundry's
 *   `user` scope). It follows them to another address, browser or device:
 *   choices and preferences, such as which voice effects run and how.
 * - `"device"`: in this browser only (Foundry's `client` scope), for what
 *   depends on the machine: its microphone, camera or CPU, such as the
 *   voice gate's sensitivity or a camera effect's quality.
 *
 * A browser keeps a site's storage per address: a LAN address one day and
 * a public one the next count as different sites, so `"device"` settings
 * start again there.
 */
export type SettingStorage = "player" | "device";

/** The value types Foundry stores a setting as. */
export type SettingType =
  | NumberConstructor
  | StringConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor;

export interface ModuleSetting {
  readonly storage: SettingStorage;
  readonly type: SettingType;
  /** What it reads before anything is saved. */
  readonly default: unknown;
  /**
   * After it changes, with the new value; for `"player"` also when the
   * player changes it on another device that is online.
   */
  readonly onChange?: (value: unknown) => void;
}

/**
 * A module's own settings, kept as each declares. Not shown in Foundry's
 * settings window: modules show them in their own UI.
 */
export interface ModuleSettings {
  /**
   * Registers `module`'s setting with Foundry. Call it in the
   * "modularAV.register" hook (or earlier, from `init`). A `"player"`
   * setting this browser kept before (as a device setting) moves to the
   * player once the game is ready, unless the player saved one already:
   * nobody loses their setup when a module changes how a setting is kept.
   */
  register(module: string, key: string, setting: ModuleSetting): void;
  get(module: string, key: string): unknown;
  /**
   * Saves a value. A `"player"` setting goes to the server, so it saves
   * once the game is ready; saves of the same setting go one at a time.
   */
  set(module: string, key: string, value: unknown): Promise<void>;
  /** How it is kept, or null if it isn't registered here. */
  storageOf(module: string, key: string): SettingStorage | null;
}
