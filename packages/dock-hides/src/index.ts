import { DOCK_REGISTER_HOOK, type DockApi } from "@modular-av/dock/themes";

const MODULE_ID = "modular-av-dock-hides";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (dock: DockApi) => void): number;
  };
}

/** A file this module serves, from Foundry's root. */
const file = (path: string): string => `modules/${MODULE_ID}/${path}`;

/**
 * A hide in a frame of four poles round each camera: the poles reach 8% of
 * a tile's width past the top and the sides, and 17% under the picture,
 * where the name's tag and the tally marks are (`reach` in
 * tools/art/hides/measures.json, which the pictures are made to). The
 * dock keeps that much room round a tile in every layout: frames hang
 * side by side, never on each other.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "hides",
    label: `${MODULE_ID}.label`,
    stylesheet: file("hides.css"),
    frames: {
      reach: { top: 0.08, right: 0.08, bottom: 0.17, left: 0.08 },
    },
    preview: file("art/hide-1.webp"),
    suggestedLayout: "docked",
  });
});
