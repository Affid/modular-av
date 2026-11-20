import { DOCK_REGISTER_HOOK, type DockApi } from "@modular-av/dock/themes";

const MODULE_ID = "modular-av-dock-vines";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (dock: DockApi) => void): number;
  };
}

/** A file this module serves, from Foundry's root. */
const file = (path: string): string => `modules/${MODULE_ID}/${path}`;

/**
 * Branches grown into a loop round each camera, with vines from one
 * corner: the art reaches 11% of a tile's width past every side, as it
 * was drawn (`REACH` in tools/art/vines/geometry.ts). In a grid the
 * cameras share one lattice: each is 1.7% from its neighbours' shared
 * branch (`GRID_SHARE`), and the stylesheet draws the cell over that.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "vines",
    label: `${MODULE_ID}.label`,
    stylesheet: file("vines.css"),
    frames: {
      reach: { top: 0.11, right: 0.11, bottom: 0.11, left: 0.11 },
      gridRoom: { top: 0.017, right: 0.017, bottom: 0.017, left: 0.017 },
    },
    preview: file("frames/vines-tl-green.svg"),
    suggestedLayout: "scattered",
  });
});
