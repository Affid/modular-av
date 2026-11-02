import { MODULE_ID } from "./constants.ts";

export interface MenuDeps {
  readonly settings: {
    registerMenu(module: string, key: string, data: object): void;
  };
  /** Foundry's ApplicationV2: a menu's type must extend it. */
  readonly base: abstract new (...args: never[]) => object;
  readonly open: () => void;
}

/** For a world with no dock: Foundry's module settings open the window. */
export function registerMenu(deps: MenuDeps): void {
  const Base = deps.base as unknown as new () => {
    render(options?: object): unknown;
  };
  class OpenMixer extends Base {
    override render(): Promise<this> {
      deps.open();
      return Promise.resolve(this);
    }
  }
  const key = `${MODULE_ID}.menu`;
  deps.settings.registerMenu(MODULE_ID, "mixer", {
    name: `${key}.name`,
    label: `${key}.label`,
    hint: `${key}.hint`,
    icon: "fa-solid fa-sliders",
    type: OpenMixer,
    restricted: false,
  });
}
