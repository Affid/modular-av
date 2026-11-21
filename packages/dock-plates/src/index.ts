import { DOCK_REGISTER_HOOK, type DockApi } from "@modular-av/dock/themes";

const MODULE_ID = "modular-av-dock-plates";

/** The slice of Foundry's globals this module uses. */
declare global {
  var Hooks: {
    once(hook: string, fn: (dock: DockApi) => void): number;
  };
}

/** A file this module serves, from Foundry's root. */
const file = (path: string): string => `modules/${MODULE_ID}/${path}`;

/**
 * A plate of steel round each camera, laced with a cord: plate and cord
 * reach 6% of a tile's width past the top and the sides, and 17% under the
 * picture, where the name is cut into the plate and the viewer's knife lies
 * (`reach` in tools/art/plates/measures.json, which the pictures are made
 * to). The dock keeps that much room round a tile in every layout: plates
 * lie side by side, never on each other.
 */
Hooks.once(DOCK_REGISTER_HOOK, (dock) => {
  dock.themes.register({
    id: "plates",
    label: `${MODULE_ID}.label`,
    stylesheet: file("plates.css"),
    frames: {
      reach: { top: 0.06, right: 0.06, bottom: 0.17, left: 0.06 },
    },
    preview: file("art/plate-1.webp"),
    suggestedLayout: "docked",
  });
});
