import type { ModularAV } from "@modular-av/api";
import { MODULE_ID } from "./constants.ts";
import { renderMixer } from "./window/view.ts";
import { BROWSER_RECORDING } from "./window/voice-test.ts";
import { createMixerWindow } from "./window/window.ts";

let opened: { render(options?: object): unknown } | null = null;

const localized = (key: string): string => game.i18n.localize(key);

/** Opens the mixer, the one window however often it is asked for. */
export function openMixer(api: ModularAV, onError: (e: unknown) => void): void {
  opened ??= createMixerWindow(foundry.applications.api.ApplicationV2, {
    title: localized(`${MODULE_ID}.title`),
    stylesheet: foundry.utils.getRoute(`modules/${MODULE_ID}/styles/mixer.css`),
    fill: (doc) =>
      renderMixer(
        {
          api,
          isGM: game.user.isGM,
          t: (key, data) => game.i18n.format(`${MODULE_ID}.${key}`, data),
          text: localized,
          onError,
          automationRate: "automationRate" in AudioParam.prototype,
          recording: BROWSER_RECORDING,
        },
        doc,
      ),
  });
  void opened.render({ force: true });
}
