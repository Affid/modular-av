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
 * Woven branches round each camera, with vines from one corner: the art
 * reaches 11% of a tile's width past every side, as it was drawn
 * (`REACH` in tools/art/vines/geometry.ts).
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "vines",
    label: `${MODULE_ID}.label`,
    stylesheet: file("vines.css"),
    frames: { reach: { top: 0.11, right: 0.11, bottom: 0.11, left: 0.11 } },
    preview: file("frames/vines-tl-green.svg"),
    suggestedLayout: "scattered",
  });
});
