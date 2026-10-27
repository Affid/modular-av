import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** The world setting that keeps the board's plan between visits. */
export const PLAN_SETTING = "modulesPlan";

/** World: whether GMs' browsers ask GitHub for updates and new modules. */
export const CHECK_SETTING = "checkGitHub";

/** Client: when this browser last asked GitHub, and what it last told. */
export const LAST_CHECK_SETTING = "lastGitHubCheck";
export const LAST_NEWS_SETTING = "lastModuleNews";

/** World: a GM said not to be told again that no service is enabled. */
export const NO_SERVICE_SETTING = "noServiceDismissed";

/** At most once a day, when a GM loads the world. */
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

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
/** The board's settings: its plan, asking GitHub, and what was told. */
function registerModulesSettings(game: FoundryGame): void {
  game.settings.register(MODULE_ID, PLAN_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: null,
  });
  game.settings.register(MODULE_ID, CHECK_SETTING, {
    name: `${MODULE_ID}.modules.check.name`,
    hint: `${MODULE_ID}.modules.check.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, NO_SERVICE_SETTING, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, LAST_CHECK_SETTING, {
    scope: "client",
    config: false,
    type: Number,
    default: 0,
  });
  game.settings.register(MODULE_ID, LAST_NEWS_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
}

export function registerModulesMenu(deps: ModulesMenuDeps): void {
  const { game } = deps;
  registerModulesSettings(game);
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

/** Whether this GM's browser should ask GitHub for news now. */
export function checkIsDue(game: FoundryGame, now: number): boolean {
  if (!game.user.isGM) return false;
  if (game.settings.get(MODULE_ID, CHECK_SETTING) === false) return false;
  const last = Number(game.settings.get(MODULE_ID, LAST_CHECK_SETTING)) || 0;
  return now - last >= CHECK_EVERY_MS;
}

/** Whether to tell this GM that no service module is enabled. */
export const noServiceIsDue = (game: FoundryGame, services: number): boolean =>
  services === 0 &&
  game.user.isGM &&
  game.settings.get(MODULE_ID, NO_SERVICE_SETTING) !== true;
