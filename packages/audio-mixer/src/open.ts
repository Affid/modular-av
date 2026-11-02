import type { ModularAV } from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";
import { createWriter, type Writer } from "./model/queue.ts";
import { foundryPresetStore } from "./presets/foundry-store.ts";
import { createPresets, type Presets } from "./presets/presets.ts";
import { renderMixer } from "./window/view.ts";
import { BROWSER_RECORDING } from "./window/voice-test.ts";
import { createMixerWindow } from "./window/window.ts";

const localized = (key: string): string => game.i18n.localize(key);

/** Foundry renders a dialog's content as HTML. */
const confirm = async (text: string): Promise<boolean> =>
  (await foundry.applications.api.DialogV2.confirm({
    window: { title: localized(`${MODULE_ID}.title`) },
    content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
  })) === true;

const onOwnUserChange = (listener: () => void): (() => void) => {
  const id = Hooks.on("updateUser", (user: { id: string }) => {
    if (user.id === game.user.id) listener();
  });
  return () => {
    Hooks.off("updateUser", id);
  };
};

export interface Mixer {
  readonly presets: Presets;
  readonly writes: Writer;
  /** The one window, however often it is asked for. */
  open(): void;
}

function createMixer(api: ModularAV): Mixer {
  const writes = createWriter(reportError);
  const presets = createPresets({
    api,
    writes,
    newId: () => foundry.utils.randomID(),
    store: foundryPresetStore({
      user: () => game.user,
      getSetting: (key) => game.settings.get(MODULE_ID, key),
      setSetting: (key, value) => game.settings.set(MODULE_ID, key, value),
      onUserChange: onOwnUserChange,
    }),
  });
  const window = createMixerWindow(foundry.applications.api.ApplicationV2, {
    title: localized(`${MODULE_ID}.title`),
    stylesheet: foundry.utils.getRoute(`modules/${MODULE_ID}/styles/mixer.css`),
    fill: (doc) =>
      renderMixer(
        {
          api,
          presets,
          writes,
          isGM: game.user.isGM,
          t: (key, data) => game.i18n.format(`${MODULE_ID}.${key}`, data),
          text: localized,
          onError: reportError,
          automationRate: "automationRate" in AudioParam.prototype,
          recording: BROWSER_RECORDING,
          confirm,
        },
        doc,
      ),
  });
  return {
    presets,
    writes,
    open() {
      void window.render({ force: true });
    },
  };
}

let mixer: Mixer | null = null;

export const mixerFor = (api: ModularAV): Mixer => (mixer ??= createMixer(api));
