import { DOCK_REGISTER_HOOK, type DockApi } from "@modular-av/dock/themes";

const MODULE_ID = "modular-av-dock-strongbox";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (dock: DockApi) => void): number;
  };
}

/** A file this module serves, from Foundry's root. */
const file = (path: string): string => `modules/${MODULE_ID}/${path}`;

/**
 * Each camera is a window in the box's boards, bound in a forged iron
 * strap with a lock over its top edge: the lock reaches 7% of a tile's
 * width past the picture's top, the strap 6% past its sides, and the
 * stencilled name lies in the 15% under it (`reach` in
 * tools/art/strongbox/measures.json, which the pictures are made to). The
 * dock keeps that much room round a tile in every layout, so nine cameras
 * still fit two to a row in a dock 300 pixels wide.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "strongbox",
    label: `${MODULE_ID}.label`,
    stylesheet: file("strongbox.css"),
    frames: {
      reach: { top: 0.07, right: 0.06, bottom: 0.15, left: 0.06 },
    },
    preview: file("art/frame-shield-rest.webp"),
    suggestedLayout: "docked",
  });
});
