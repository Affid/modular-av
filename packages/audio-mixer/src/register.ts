import type { ButtonControl, ModularAV } from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";

const button = (id: string, open: () => void): ButtonControl => ({
  type: "button",
  id,
  label: `${MODULE_ID}.open`,
  icon: "fa-solid fa-sliders",
  run() {
    open();
    return Promise.resolve();
  },
});

/** The ways in that need the core; the settings menu is registered at init. */
export function registerMixer(
  api: Pick<ModularAV, "contributions">,
  open: () => void,
): void {
  api.contributions.register({
    ...button(`${MODULE_ID}.open`, open),
    kind: "control",
    place: "quick",
  });
  api.contributions.register({
    kind: "settings-section",
    id: `${MODULE_ID}.section`,
    label: `${MODULE_ID}.section`,
    tab: "voice",
    settings: [],
    controls: [button(`${MODULE_ID}.settingsOpen`, open)],
  });
}
