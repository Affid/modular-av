import { DOCK_REGISTER_HOOK, type DockApi } from "@modular-av/dock/themes";

const MODULE_ID = "modular-av-dock-spaceship";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (dock: DockApi) => void): number;
  };
}

/** A file this module serves, from Foundry's root. */
const file = (path: string): string => `modules/${MODULE_ID}/${path}`;

/**
 * Each camera sits in a small CRT monitor: its case reaches 6% of a
 * tile's width over the picture, 6.5% past its sides, and 17% under it,
 * where the chin holds the name's readout, the grille and the TX lamp
 * (`reach` in tools/art/spaceship/measures.json, which the pictures are
 * rendered to). The dock keeps that much room round a tile in every
 * layout, so nine cameras still fit two to a row in a dock 300 pixels
 * wide.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "spaceship",
    label: `${MODULE_ID}.label`,
    stylesheet: file("spaceship.css"),
    frames: {
      reach: { top: 0.06, right: 0.065, bottom: 0.17, left: 0.065 },
    },
    preview: file("art/monitor-rest.webp"),
    suggestedLayout: "docked",
  });
});
