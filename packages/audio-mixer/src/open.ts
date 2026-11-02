import type { ModularAV } from "@modular-av/api";
import { MODULE_ID, SOCKET_CHANNEL } from "./constants.ts";
import { createGmLayers, type GmLayers } from "./layers/gm-layers.ts";
import { foundryGmStore, foundryLayerStore } from "./layers/foundry-store.ts";
import { createLayers, type Layers } from "./layers/layers.ts";
import { createWriter, type Writer } from "./model/queue.ts";
import { foundryPresetStore } from "./presets/foundry-store.ts";
import { createPresets, type Presets } from "./presets/presets.ts";
import { createTable, type Table } from "./table/table.ts";
import type { MixerTab, MixerView } from "./window/context.ts";
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
  readonly table: Table;
  readonly layers: Layers;
  /** A GM's; null on a player's client. */
  readonly gmLayers: GmLayers | null;
  /** The one window, however often it is asked for. */
  open(tab?: MixerTab): void;
}

function createMixer(api: ModularAV): Mixer {
  const writes = createWriter(reportError);
  const layers = createLayers({
    api,
    writes,
    store: foundryLayerStore(),
    selfIsGM: game.user.isGM,
    // Through `format`, Foundry escapes it: a label isn't this module's text.
    notify: ({ label }) => {
      ui.notifications.info(`${MODULE_ID}.layers.notice`, {
        format: { label },
      });
    },
  });
  const gmLayers = game.user.isGM
    ? createGmLayers({
        store: foundryGmStore(),
        definitions: () => api.effects.list(),
        newId: () => foundry.utils.randomID(),
      })
    : null;
  // Another GM's personal layer shows only in this GM's list.
  if (gmLayers)
    Hooks.on("updateUser", () => {
      layers.changed();
    });
  const presets = createPresets({
    api,
    writes,
    layers,
    newId: () => foundry.utils.randomID(),
    store: foundryPresetStore({
      user: () => game.user,
      getSetting: (key) => game.settings.get(MODULE_ID, key),
      setSetting: (key, value) => game.settings.set(MODULE_ID, key, value),
      onUserChange: onOwnUserChange,
    }),
  });
  const automationRate = "automationRate" in AudioParam.prototype;
  const table = createTable({
    api,
    channel: api.socket(SOCKET_CHANNEL),
    isGM: (id) => game.users.get(id)?.isGM === true,
    selfIsGM: game.user.isGM,
    automationRate,
    layerStates: () => layers.states(),
    onError: reportError,
  });
  let view: MixerView | null = null;
  let wanted: MixerTab = "mine";
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
          automationRate,
          recording: BROWSER_RECORDING,
          confirm,
          layers,
          ...(gmLayers ? { table, gmLayers } : {}),
        },
        doc,
      ),
    onFilled(filled) {
      view = filled;
      view.show?.(wanted);
    },
  });
  return {
    presets,
    writes,
    table,
    layers,
    gmLayers,
    open(tab = "mine") {
      wanted = tab;
      view?.show?.(tab);
      void window.render({ force: true });
    },
  };
}

let mixer: Mixer | null = null;

export const mixerFor = (api: ModularAV): Mixer => (mixer ??= createMixer(api));
