import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** The world setting that keeps the board's plan between visits. */
export const PLAN_SETTING = "modulesPlan";

/** Under the core's module settings: "Plan your modules". */
export const MODULES_MENU = "modules";

type ApplicationBase = abstract new (...args: never[]) => object;

export interface ModulesMenuDeps {
  readonly game: FoundryGame;
  /** Foundry's ApplicationV2: a menu's type must extend it. */
  readonly base: ApplicationBase;
  /** Loads the board and opens it. */
  readonly open: () => void;
}

/**
 * The modules menu, GMs only. Foundry opens `new type()` on each click:
 * this type only loads the real window (a chunk of its own) and opens it.
 */
export function registerModulesMenu(deps: ModulesMenuDeps): void {
  const { game } = deps;
  game.settings.register(MODULE_ID, PLAN_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: null,
  });
  const Base = deps.base as unknown as new () => {
    render(options?: object): unknown;
  };
  class OpenModulesBoard extends Base {
    override render(): Promise<this> {
      deps.open();
      return Promise.resolve(this);
    }
  }
  const key = `${MODULE_ID}.modules.menu`;
  game.settings.registerMenu(MODULE_ID, MODULES_MENU, {
    name: `${key}.name`,
    label: `${key}.label`,
    hint: `${key}.hint`,
    icon: "fa-solid fa-puzzle-piece",
    type: OpenModulesBoard,
    restricted: true,
  });
}
