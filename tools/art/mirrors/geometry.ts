// The mirrors theme's measures, in the units its pictures are made in: a
// tile is 1000 wide, with its top left corner at the origin. The numbers
// are in measures.json, which the Blender scenes read too
// (render/measures.py): each size is said once.
import type { Box } from "../vines/geometry.ts";
import type { Size } from "../scrolls/geometry.ts";
import measures from "./measures.json" with { type: "json" };

export const TILE: Size = measures.tile;

/**
 * How far the hands, the light in the glass and the name reach past the
 * video, as fractions of the tile's width: what the theme registers as
 * `frames.reach`, and so the room the dock keeps round a tile.
 */
export const REACH = measures.reach;

/** The frame layer: the tile and its reach. */
export const VIEW: Box = {
  left: -REACH.left * TILE.width,
  top: -REACH.top * TILE.width,
  right: (1 + REACH.right) * TILE.width,
  bottom: TILE.height + REACH.bottom * TILE.width,
};

/** A picture over the frame layer's box, in its own pixels, at `density` pixels to a tile unit. */
const over = (density: number): Size => ({
  width: Math.floor((VIEW.right - VIEW.left) * density),
  height: Math.floor((VIEW.bottom - VIEW.top) * density),
});

/** The hands, the fog and the crack: they have edges to keep sharp. */
export const FRAME: Size = over(measures.frameDensity);

/** The light in the glass round a picture: it has no edges, so fewer pixels. */
export const LIGHT: Size = over(measures.lightDensity);

/** The pane of glass a scattered camera carries. */
export const PANE: Size = over(measures.paneDensity);

/** Where the name's middle is lettered, under the picture. */
export const NAME: { readonly y: number } = measures.name;

/** The two poses of the hands: where each hand holds the picture's side, and how. */
export const HANDS: {
  readonly seed: number;
  readonly poses: Readonly<
    Record<
      "1" | "2",
      Readonly<
        Record<
          "left" | "right",
          { readonly hold: "grip" | "claw"; readonly y: number }
        >
      >
    >
  >;
} = measures.hands as typeof HANDS;

/** The level's marks, cut into the glass above the viewer's own picture: the level meter's box. */
export const LEVEL: Box & { readonly marks: number } = measures.level;

/** The blow that cracked the glass of a player out of the call, and how far the cracks may run. */
export const CRACK = measures.crack;

/**
 * The empty glass under the cameras: from how much spare height the
 * contract and then the quill show, from how much both are whole, and how
 * far below the glass's foot they sink when there is less room.
 */
export const FILL = measures.fill;

/** The pictures that have a size of their own on screen. */
export const PICTURES = measures.pictures;
