// The spaceship theme's measures, in the units its pictures are made in: a
// tile is 1000 wide, with its top left corner at the origin. The numbers
// are in measures.json, which the Blender scenes read too
// (render/measures.py): each size is said once.
import type { Box } from "../vines/geometry.ts";
import type { Size } from "../scrolls/geometry.ts";
import measures from "./measures.json" with { type: "json" };

export const TILE: Size = measures.tile;

/**
 * How far a monitor's case reaches past the video, as fractions of the
 * tile's width: its top and sides, and its chin with the readout under the
 * picture. What the theme registers as `frames.reach`, and so the room the
 * dock keeps round a tile.
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
  width: Math.round((VIEW.right - VIEW.left) * measures.frameDensity),
  height: Math.round((VIEW.bottom - VIEW.top) * measures.frameDensity),
};

/**
 * What a monitor shows of its player: at rest, speaking, muted (tape over
 * the grille), deafened (the headset hung on the case), and both.
 */
export const STATES = measures.states as readonly (
  "rest" | "speak" | "muted" | "deaf" | "mdeaf"
)[];

/** The readout in the chin: its bezel's opening, and the lit window inside it, where the name is. */
export const READOUT: { readonly outer: Box; readonly window: Box } =
  measures.readout;

/** The viewer's own level: its window in the case's right side, across at `x`, from `top` to `bottom`, `across` wide. */
export const METER = measures.meter;

/** From how much room under the cameras (CSS px) each arrangement of the wall's things shows. */
export const FILL = measures.fill;

/** The pictures that have a size of their own on screen, in CSS px at `density` pixels to one. */
export const PICTURES = measures.pictures;
