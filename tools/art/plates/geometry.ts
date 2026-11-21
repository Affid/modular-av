// The plates theme's measures, in the units its pictures are made in: a
// tile is 1000 wide, with its top left corner at the origin. The numbers
// are in measures.json, which the Blender scenes read too
// (render/measures.py): each size is said once.
import type { Box } from "../vines/geometry.ts";
import type { Size } from "../scrolls/geometry.ts";
import measures from "./measures.json" with { type: "json" };

export const TILE: Size = measures.tile;

/**
 * How far a plate and its cord reach past the video, as fractions of the
 * tile's width: what the theme registers as `frames.reach`, and so the
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

/**
 * The plate, in tile units: how far it runs past the picture (at the top
 * and sides, and below, where the name is cut and the knife lies), how
 * much of the picture's edge it covers, its rolled edge, the rib round the
 * picture, how far the cord stands out past it, and a seed for each
 * plate's dents and rust.
 */
export const PLATE: {
  readonly out: number;
  readonly below: number;
  readonly cover: number;
  readonly bead: number;
  readonly ribAt: number;
  readonly ribHalf: number;
  readonly cordOut: number;
  readonly seeds: readonly number[];
} = measures.plate;

/** The knife under the name, along the tile: its parts from the pommel to the point, and the blade's half width. */
export const KNIFE = measures.knife;

/** The blade's box: where the level meter lies, and what its mask is cut to. */
export const LEVEL: Box = measures.level;

/** The pictures that have a size of their own on screen. */
export const PICTURES = measures.pictures;

/** What hangs in the free room under the cameras, from the lowest to the tallest. */
export const THINGS = ["mace", "gauntlets", "buckler"] as const;
