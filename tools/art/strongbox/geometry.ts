// The strongbox theme's measures, in the units its pictures are made in: a
// tile is 1000 wide, with its top left corner at the origin. The numbers
// are in measures.json, which the Blender scenes read too
// (render/measures.py): each size is said once.
import type { Box } from "../vines/geometry.ts";
import type { Size } from "../scrolls/geometry.ts";
import measures from "./measures.json" with { type: "json" };

export const TILE: Size = measures.tile;

/**
 * How far a window's iron reaches past the video, as fractions of the
 * tile's width: the lock over the top edge, the strap at the sides, and
 * the stencilled name under it. What the theme registers as
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

/** A picture that fills the frame layer, in its own pixels. */
export const FRAME: Size = {
  width: Math.floor((VIEW.right - VIEW.left) * measures.frameDensity),
  height: Math.floor((VIEW.bottom - VIEW.top) * measures.frameDensity),
};

/** The three locks, which take turns so that neighbours differ. */
export const LOCKS = measures.locks as readonly (
  "shield" | "round" | "slide"
)[];

/** What a window shows of its player: at rest, speaking, muted, deafened, out of the call. */
export const STATES = measures.states as readonly (
  "rest" | "speak" | "muted" | "deaf" | "out"
)[];

/** How far the strap runs out past the picture's edge, and how far in over it. */
export const STRAP: { readonly out: number; readonly in: number } =
  measures.strap;

/** The middle of every lock's keyhole, on the window's top edge. */
export const KEYHOLE: { readonly x: number; readonly y: number } =
  measures.keyhole;

/** Where the name's middle is stencilled, under the picture. */
export const NAME: { readonly y: number } = measures.name;

/**
 * The viewer's level: the plate on the bottom strap, the slot through it
 * and the slot with its lips (the meter's box, and what its mask and its
 * lit picture cover), and the mask's pixels to a tile unit.
 */
export const LEVEL: {
  readonly plate: Box;
  readonly slot: Box;
  readonly fill: Box;
  readonly maskDensity: number;
} = measures.level;

/** From how much room under the cameras each thing shows, and how far the group is lifted off the floor. */
export const FILL = measures.fill;

/** What comes onto the bare boards, in the order it comes. */
export const THINGS = ["knife", "picks", "keys", "grapnel"] as const;

/** The pictures that have a size of their own on screen. */
export const PICTURES = measures.pictures;
