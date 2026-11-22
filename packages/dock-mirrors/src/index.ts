import { DOCK_REGISTER_HOOK, type DockApi } from "@modular-av/dock/themes";

const MODULE_ID = "modular-av-dock-mirrors";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (dock: DockApi) => void): number;
  };
}

/** A file this module serves, from Foundry's root. */
const file = (path: string): string => `modules/${MODULE_ID}/${path}`;

/**
 * The hands that hold each camera and the light in the glass round it
 * reach 7% of a tile's width past the top and the sides, and 12% under
 * the picture, where the name is lettered on the glass (`reach` in
 * tools/art/mirrors/measures.json, which the pictures are made to). The
 * dock keeps that much room round a tile in every layout, so nine cameras
 * still fit two to a row in a dock 300 pixels wide.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "mirrors",
    label: `${MODULE_ID}.label`,
    stylesheet: file("mirrors.css"),
    frames: {
      reach: { top: 0.07, right: 0.07, bottom: 0.12, left: 0.07 },
    },
    preview: file("art/hands-1.webp"),
    suggestedLayout: "docked",
  });
});
