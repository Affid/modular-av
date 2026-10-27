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
 * Vine leaves around each camera, growing from the corner it sits in: the
 * artwork reaches 8% of a tile's width past every side, the widest of its
 * mirrored variants.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "vines",
    label: `${MODULE_ID}.label`,
    stylesheet: file("vines.css"),
    frames: { reach: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 } },
    preview: file("frames/vine-corner.svg"),
    suggestedLayout: "scattered",
  });
});
