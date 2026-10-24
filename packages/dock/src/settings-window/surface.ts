import type { SettingsSurfaceDefinition } from "@modular-av/api";
import { type DockContext, MODULE_ID } from "../context.ts";

/**
 * The "Voice & Video Settings" window's content, a lazy chunk: loaded the
 * first time the window opens.
 */
export function settingsSurface(ctx: DockContext): SettingsSurfaceDefinition {
  return {
    kind: "settings",
    id: `${MODULE_ID}.settings`,
    label: `${MODULE_ID}.surfaces.settings`,
    render(host) {
      let undo: (() => void) | null = null;
      let closed = false;
      import("./window.ts")
        .then(({ renderSettings }) => {
          if (!closed) undo = renderSettings(ctx, host);
        })
        .catch(ctx.onError);
      return () => {
        closed = true;
        undo?.();
      };
    },
  };
}
