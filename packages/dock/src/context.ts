import type { ModularAV, ParticipantId } from "@modular-av/api";

export const MODULE_ID = "modular-av-dock";

/** A setting as Foundry registered it (`game.settings.settings`). */
export interface FoundrySettingConfig {
  readonly namespace: string;
  readonly key: string;
  readonly name?: string;
  readonly hint?: string;
  readonly scope: "world" | "user" | "client";
  readonly type?: unknown;
  readonly choices?: Readonly<Record<string, string>>;
  readonly range?: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
  };
}

/** The parts of Foundry's `game` the dock uses. */
export interface DockGame {
  readonly i18n: {
    localize(key: string): string;
    format(key: string, data: Readonly<Record<string, string>>): string;
  };
  readonly settings: {
    register(namespace: string, key: string, config: object): void;
    get(namespace: string, key: string): unknown;
    set(namespace: string, key: string, value: unknown): Promise<unknown>;
    /** Every registered setting, by "<namespace>.<key>". */
    readonly settings?: ReadonlyMap<string, FoundrySettingConfig>;
  };
  readonly user: { readonly isGM: boolean };
  readonly userId: string;
  readonly keybindings?: {
    get(namespace: string, action: string): readonly { readonly key: string }[];
  };
}

/** What every part of the dock is given. */
export interface DockContext {
  readonly api: ModularAV;
  readonly selfId: ParticipantId;
  readonly isGM: boolean;
  /** The dock's own text, by key under "modular-av-dock". */
  readonly t: (
    key: string,
    params?: Readonly<Record<string, string>>,
  ) => string;
  /** Another module's label: an i18n key or plain text. */
  readonly text: (label: string) => string;
  readonly settings: DockGame["settings"];
  /** Opens the voice and video settings window (Foundry's menu). */
  readonly openSettings: () => void;
  /** A registered Foundry setting, or null. */
  readonly foundrySetting: (key: string) => FoundrySettingConfig | null;
  /** The key codes bound to Foundry's push to talk. */
  readonly pushToTalkKeys: () => readonly string[];
  /** Opens Foundry's controls, where the push to talk key is set. */
  readonly openControls: () => void;
  readonly now: () => number;
  readonly onError: (error: unknown) => void;
}

export interface ContextDeps {
  readonly game: DockGame;
  readonly api: ModularAV;
  readonly openSettings: () => void;
  readonly openControls?: () => void;
  readonly now?: () => number;
  readonly onError: (error: unknown) => void;
}

export function createContext(deps: ContextDeps): DockContext {
  const { game } = deps;
  return {
    api: deps.api,
    selfId: game.userId,
    isGM: game.user.isGM,
    t: (key, params) =>
      params
        ? game.i18n.format(`${MODULE_ID}.${key}`, params)
        : game.i18n.localize(`${MODULE_ID}.${key}`),
    text: (label) => game.i18n.localize(label),
    settings: game.settings,
    openSettings: deps.openSettings,
    foundrySetting: (key) => game.settings.settings?.get(key) ?? null,
    pushToTalkKeys: () =>
      (game.keybindings?.get("core", "pushToTalk") ?? []).map((b) => b.key),
    openControls: deps.openControls ?? (() => undefined),
    now: deps.now ?? (() => Date.now()),
    onError: deps.onError,
  };
}
