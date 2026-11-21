import { DOCK_REGISTER_HOOK, type DockApi } from "@modular-av/dock/themes";

const MODULE_ID = "modular-av-dock-scrolls";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (dock: DockApi) => void): number;
  };
}

/** A file this module serves, from Foundry's root. */
const file = (path: string): string => `modules/${MODULE_ID}/${path}`;

/**
 * A scroll of vellum round each camera: its rolls reach 7.5% of a tile's
 * width past the sides, the sheet 5% past the top, and 17% under the
 * picture, where the name's plate and a row of signs are (`reach` in
 * tools/art/scrolls/measures.json, which the pictures are made to). The
 * dock keeps that much room round a tile in every layout: scrolls lie
 * side by side, never on each other.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "scrolls",
    label: `${MODULE_ID}.label`,
    stylesheet: file("scrolls.css"),
    frames: {
      reach: { top: 0.05, right: 0.075, bottom: 0.17, left: 0.075 },
    },
    preview: file("art/scroll-1.webp"),
    suggestedLayout: "docked",
  });
});
