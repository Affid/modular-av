// The measures of the dock's own plant, in CSS pixels: the trunk down its
// free edge and the boughs off it. The stylesheet uses the same ones
// (theme.test.ts holds it to them). These pictures are drawn four units to
// a pixel, so that bark and leaves come out the size they are on a frame.

/** Units of a picture per CSS pixel. */
export const UNITS = 4;

/**
 * The trunk: a picture this wide that repeats every `period` along the
 * dock's free edge, its centre line `centre` from that edge.
 */
export const TRUNK = { width: 40, period: 440, centre: 12 } as const;

/**
 * A bough, cut into three by the stylesheet: where it joins the trunk,
 * a middle that repeats, and a tip that thins out and curls.
 */
export const BOUGH = { height: 44, joint: 50, period: 150, tip: 116 } as const;

/** A shadow at this scale: where it falls and how soft it is. */
export const PLANT_SHADOW = { dx: 5, dy: 8, blur: 7 } as const;

/**
 * The branch that grows off the trunk into the room under the cameras: its
 * picture's size in each of three sizes, and the spare height (the dock's
 * `--mav-dock-spare`) from which each is shown.
 */
export const BRANCH = {
  small: { width: 210, height: 125, from: 85 },
  medium: { width: 275, height: 260, from: 190 },
  large: { width: 275, height: 450, from: 350 },
} as const;
export type BranchSize = keyof typeof BRANCH;

/**
 * Where a branch leaves the trunk: this far past its picture's right edge
 * and above its bottom edge.
 */
export const BRANCH_ROOT = { right: 7.5, up: 15 } as const;

/**
 * The plate a name hangs on: its picture's own size, and how much of each
 * end keeps its shape while the middle stretches with the name.
 */
export const PLATE = { width: 150, height: 40, end: 15 } as const;
