import { MODULE_ID } from "../context.ts";
import type { DockContext } from "../context.ts";
import { applyTheme } from "./apply.ts";
import { createThemes, type Themes } from "./choice.ts";
import type { OpenRegistry } from "./registry.ts";
import { DOCK_REGISTER_HOOK, type DockApi } from "./types.ts";

/** What showing themes needs from Foundry. */
export interface ThemeHost {
  readonly settings: DockContext["settings"];
  /** Foundry's `Hooks.callAll`. */
  readonly callAll: (hook: string, api: DockApi) => void;
  /** Foundry's `foundry.utils.getRoute`, for a world under a route prefix. */
  readonly route: (path: string) => string;
  readonly doc: Document;
}

/** The dock's public API: registering themes, reading them. */
export const dockApiOf = (registry: OpenRegistry): DockApi =>
  Object.freeze<DockApi>({
    themes: Object.freeze<DockApi["themes"]>({
      register: (theme) => {
        registry.register(theme);
      },
      list: () => registry.list(),
      get: (id) => registry.get(id),
    }),
  });

/**
 * Lets theme modules register in the dock's hook (during Foundry's
 * `setup`), then shows the theme chosen, and again whenever a choice
 * changes.
 */
export function startThemes(
  host: ThemeHost,
  registry: OpenRegistry,
  api: DockApi,
): Themes {
  registry.run(() => {
    host.callAll(DOCK_REGISTER_HOOK, api);
  });
  const themes = createThemes(host, registry, MODULE_ID);
  const show = (): void => {
    applyTheme(host.doc, themes.shown(), host.route);
  };
  show();
  themes.onChange(show);
  return themes;
}
