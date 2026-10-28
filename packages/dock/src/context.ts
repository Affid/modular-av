import type { ModularAV, ParticipantId } from "@modular-av/api";
import { NO_THEMES, type Themes } from "./themes/choice.ts";

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

/** A Foundry scene, as the dock uses it. */
export interface FoundryScene {
  readonly id: string;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  unsetFlag(scope: string, key: string): Promise<unknown>;
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
  readonly scenes?: {
    readonly viewed?: FoundryScene | null;
    readonly active?: FoundryScene | null;
  };
  readonly keybindings?: {
    get(namespace: string, action: string): readonly { readonly key: string }[];
    set?(
      namespace: string,
      action: string,
      bindings: readonly {
        readonly key: string;
        readonly modifiers: readonly string[];
      }[],
    ): Promise<unknown>;
  };
}

/** The scene shown, and the scattered layout a GM saved for it. */
export interface SceneRef {
  readonly id: string;
  /** The saved layout as stored (a scene flag), or undefined. */
  layout(): unknown;
  /** GMs only: Foundry refuses players. */
  saveLayout(layout: unknown): Promise<void>;
  clearLayout(): Promise<void>;
}

export interface Scenes {
  /** The scene viewed, or the active one where there's no canvas. */
  current(): SceneRef | null;
  /** The scene shown changed, or its layout did. */
  onChange(listener: () => void): () => void;
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
  /** Binds Foundry's push to talk to this key (a KeyboardEvent code). */
  readonly setPushToTalkKey: (code: string) => Promise<void>;
  /** Reloads this page, or every connected one (a GM's). */
  readonly reload: (everyone: boolean) => void;
  readonly now: () => number;
  readonly onError: (error: unknown) => void;
  readonly scenes: Scenes;
  /** The themes registered, and the one shown. */
  readonly themes: Themes;
}

export interface ContextDeps {
  readonly game: DockGame;
  readonly api: ModularAV;
  readonly openSettings: () => void;
  readonly reload?: (everyone: boolean) => void;
  readonly now?: () => number;
  readonly onError: (error: unknown) => void;
  /** Foundry's hooks for the scene shown and its changes. */
  readonly onSceneChange?: (listener: () => void) => () => void;
  readonly themes?: Themes;
}

const LAYOUT_FLAG = "layout";

/**
 * A scene's layout is kept as JSON text: an object flag would be merged
 * with the old one by Foundry's update, keeping tiles that were removed.
 */
const sceneRef = (scene: FoundryScene): SceneRef => ({
  id: scene.id,
  layout: () => scene.getFlag(MODULE_ID, LAYOUT_FLAG),
  async saveLayout(layout) {
    await scene.setFlag(MODULE_ID, LAYOUT_FLAG, JSON.stringify(layout));
  },
  async clearLayout() {
    await scene.unsetFlag(MODULE_ID, LAYOUT_FLAG);
  },
});

/** With `core.noCanvas` no scene is viewed: the active one stands in. */
function createScenes(deps: ContextDeps): Scenes {
  return {
    current() {
      const scenes = deps.game.scenes;
      const scene = scenes?.viewed ?? scenes?.active ?? null;
      return scene ? sceneRef(scene) : null;
    },
    onChange: deps.onSceneChange ?? (() => () => undefined),
  };
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
    setPushToTalkKey: async (code) => {
      await game.keybindings?.set?.("core", "pushToTalk", [
        { key: code, modifiers: [] },
      ]);
    },
    reload: deps.reload ?? (() => undefined),
    now: deps.now ?? (() => Date.now()),
    onError: deps.onError,
    scenes: createScenes(deps),
    themes: deps.themes ?? NO_THEMES,
  };
}
