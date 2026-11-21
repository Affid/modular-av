// The hides theme's measures, in the units its pictures are made in: a
// tile is 1000 wide, with its top left corner at the origin. The numbers
// are in measures.json, which the Blender scenes read too
// (render/measures.py): each size is said once.
import type { Box } from "../vines/geometry.ts";
import type { Size } from "../scrolls/geometry.ts";
import measures from "./measures.json" with { type: "json" };

export const TILE: Size = measures.tile;

/**
 * How far a hide's frame of poles reaches past the video, as fractions of
 * the tile's width: what the theme registers as `frames.reach`, and so the
 * room the dock keeps round a tile.
 */
export const REACH = measures.reach;

/** The frame layer: the tile and its reach. */
export const VIEW: Box = {
  left: -REACH.left * TILE.width,
  top: -REACH.top * TILE.width,
  right: (1 + REACH.right) * TILE.width,
  bottom: TILE.height + REACH.bottom * TILE.width,
};

/** A picture that fills the frame layer, in its own pixels. */
export const FRAME: Size = {
  width: Math.floor((VIEW.right - VIEW.left) * measures.frameDensity),
  height: Math.floor((VIEW.bottom - VIEW.top) * measures.frameDensity),
};

/** The hide and its poles, in tile units: how far it runs under the picture, and where the poles lie. */
export const HIDE = measures.hide;

/** The row of tally marks on the hide under the name: the level meter's box. */
export const TALLY: Box = measures.tally;

/** The war paint: how far inside the picture's edge it is daubed, and a seed for each hide's hand. */
export const PAINT: {
  readonly inset: number;
  readonly seeds: readonly number[];
} = measures.paint;

/** The pictures that have a size of their own on screen. */
export const PICTURES = measures.pictures;
