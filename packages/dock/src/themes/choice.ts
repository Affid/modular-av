import type { DockContext } from "../context.ts";
import { DEFAULT_THEME } from "./registry.ts";
import type { ThemeDefinition, ThemeRegistry } from "./types.ts";

export const THEME_SETTINGS = {
  /** The player's theme (`user`); "" follows the world's default. */
  own: "theme",
  /** The world's default theme, set by a GM (`world`). */
  world: "defaultTheme",
} as const;

/** The themes a player can choose, and the one shown. */
export interface Themes {
  list(): readonly ThemeDefinition[];
  /** The player's own choice: "" follows the world's default. */
  own(): string;
  worldDefault(): string;
  /** The theme shown; null: the dock's own look. */
  shown(): ThemeDefinition | null;
  choose(id: string): Promise<void>;
  chooseWorldDefault(id: string): Promise<void>;
  onChange(listener: () => void): () => void;
  /** Foundry's settings changed (`onChange` of either setting). */
  changed(): void;
}

/** No theme module: only the dock's own look (tests, and before setup). */
export const NO_THEMES: Themes = {
  list: () => [],
  own: () => "",
  worldDefault: () => DEFAULT_THEME,
  shown: () => null,
  choose: () => Promise.resolve(),
  chooseWorldDefault: () => Promise.resolve(),
  onChange: () => () => undefined,
  changed: () => undefined,
};

const asId = (value: unknown): string =>
  typeof value === "string" ? value : "";

export function createThemes(
  ctx: Pick<DockContext, "settings">,
  registry: ThemeRegistry,
  moduleId: string,
): Themes {
  let listeners: readonly (() => void)[] = [];
  const get = (key: string): string => asId(ctx.settings.get(moduleId, key));
  const known = (id: string): ThemeDefinition | null =>
    registry.get(id) ?? null;
  return {
    list: () => registry.list(),
    own: () => get(THEME_SETTINGS.own),
    worldDefault: () => get(THEME_SETTINGS.world) || DEFAULT_THEME,
    shown() {
      const own = get(THEME_SETTINGS.own);
      if (own === DEFAULT_THEME) return null;
      // A theme whose module is gone gives the world's default.
      return (own ? known(own) : null) ?? known(get(THEME_SETTINGS.world));
    },
    async choose(id) {
      await ctx.settings.set(moduleId, THEME_SETTINGS.own, id);
    },
    async chooseWorldDefault(id) {
      await ctx.settings.set(moduleId, THEME_SETTINGS.world, id);
    },
    onChange(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    changed() {
      for (const listener of listeners) listener();
    },
  };
}
