import type { CamerasPlacement } from "@modular-av/api";
import { AVCommandError } from "../errors.ts";
import type { AVSettingsLike, FoundryUi } from "../foundry/globals.ts";

const SIDES = ["left", "right", "top", "bottom"] as const;
type Side = (typeof SIDES)[number];

const isSide = (value: unknown): value is Side =>
  SIDES.some((side) => side === value);

export interface Placement {
  readonly get: () => CamerasPlacement;
  readonly set: (placement: CamerasPlacement) => Promise<void>;
}

/**
 * Where a cameras surface is: a side is Foundry's own dock position (its
 * store of record); `free` lasts for this page, and the surface says so
 * again when it mounts.
 */
export function createPlacement(
  settings: () => AVSettingsLike | null,
  ui: () => FoundryUi,
): Placement {
  let free = false;
  const side = (): Side => {
    const position = settings()?.client.dockPosition;
    return isSide(position) ? position : "left";
  };
  return {
    get: () => (free ? "free" : side()),
    async set(placement) {
      if (placement !== "free" && !isSide(placement))
        throw new AVCommandError("invalid-argument", "No such placement", {
          placement: String(placement),
        });
      free = placement === "free";
      if (!free) settings()?.set("client", "dockPosition", placement);
      await ui().webrtc?.render();
      ui().hotbar?._onResize?.();
    },
  };
}
