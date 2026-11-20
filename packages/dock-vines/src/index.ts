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
 * was drawn (`REACH` in tools/art/vines/geometry.ts). The dock keeps more
 * room than that under a tile, where its name hangs on a plate (`ROOM`),
 * and less round a tile in a grid, where the cameras hang close and their
 * ivy may overlap (`GRID_ROOM`).
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "vines",
    label: `${MODULE_ID}.label`,
    stylesheet: file("vines.css"),
    frames: {
      reach: { top: 0.11, right: 0.11, bottom: 0.11, left: 0.11 },
      room: { top: 0.11, right: 0.11, bottom: 0.19, left: 0.11 },
      gridRoom: { top: 0.058, right: 0.058, bottom: 0.128, left: 0.058 },
    },
    preview: file("frames/vines-tl-green.svg"),
    suggestedLayout: "scattered",
  });
});
