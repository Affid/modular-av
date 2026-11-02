import { MODULE_ID } from "../constants.ts";

export interface Keybindings {
  register(module: string, key: string, data: object): void;
}

/** Unbound until a player binds them, so they can clash with nothing. */
export function registerPresetKeys(
  keybindings: Keybindings,
  step: (by: 1 | -1) => void,
): void {
  const key = (name: string, by: 1 | -1, label: string): void => {
    keybindings.register(MODULE_ID, name, {
      name: `${MODULE_ID}.keys.${label}.name`,
      editable: [],
      onDown: () => {
        step(by);
        return true;
      },
    });
  };
  key("nextPreset", 1, "next");
  key("previousPreset", -1, "previous");
}
