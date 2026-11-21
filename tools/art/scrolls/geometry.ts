// the scrolls theme's measures, in the units its pictures are drawn in: a
// tile is 1000 wide, with its top left corner at the origin. The numbers
// are in measures.json, which the Blender scenes read too
// (render/measures.py): each size is said once.
import type { Box } from "../vines/geometry.ts";
import measures from "./measures.json" with { type: "json" };

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A stone that holds a scroll open: where it lies on the tile, and how. */
export interface Stone {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Its turn about the upright, in radians, and the lower facet it rests on. */
  readonly spin: number;
  readonly facet: number;
}

/** A rendered picture: its size as laid out, in CSS pixels, and how many pixels it has to each. */
export interface Picture extends Size {
  readonly density: number;
}

export const TILE: Size = measures.tile;

/**
 * How far a scroll reaches past the video, as fractions of the tile's
 * width: what the theme registers as `frames.reach`, and as the room the
 * dock keeps round a tile in a grid.
 */
export const REACH = measures.reach;

/** The frame layer: the tile and its reach. */
export const VIEW: Box = {
  left: -REACH.left * TILE.width,
  top: -REACH.top * TILE.width,
  right: (1 + REACH.right) * TILE.width,
  bottom: TILE.height + REACH.bottom * TILE.width,
};

/** The row of signs on the sheet under the picture: also the level meter's box. */
export const LINE: Box = measures.line;

export const grown = (box: Box, by: number): Box => ({
  left: box.left - by,
  top: box.top - by,
  right: box.right + by,
  bottom: box.bottom + by,
});

/** How far the signs' glow spreads past their row. */
const HALO_MARGIN = 36;

/** The glow round the signs while their player speaks. */
export const HALO: Box = grown(LINE, HALO_MARGIN);

/** The stones on each of the two scrolls. */
export const STONES: readonly (readonly Stone[])[] = measures.stones;

/** The pictures that have a size of their own on screen. */
export const PICTURES = measures.pictures;

/** A picture's size in its own pixels. */
export const rendered = (picture: Picture): Size => ({
  width: picture.width * picture.density,
  height: picture.height * picture.density,
});

export const widthOf = (box: Box): number => box.right - box.left;
export const heightOf = (box: Box): number => box.bottom - box.top;
