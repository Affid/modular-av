// The plain loop a frame's branches run round: a rounded rectangle just
// inside the video's edge, measured by the distance round it, clockwise
// from where the top side starts.
import { type Point, TILE } from "./geometry.ts";

/** How far inside the video's edge the loop runs, and how round its corners are. */
const INSET = 6;
const RADIUS = 92;

const BOX = {
  left: TILE.left + INSET,
  top: TILE.top + INSET,
  right: TILE.right - INSET,
  bottom: TILE.bottom - INSET,
};
const WIDE = BOX.right - BOX.left - 2 * RADIUS;
const TALL = BOX.bottom - BOX.top - 2 * RADIUS;
const ARC = (Math.PI / 2) * RADIUS;

/** The whole way round. */
export const PERIMETER = 2 * (WIDE + TALL) + 4 * ARC;

export interface LoopSpot {
  readonly at: Point;
  /** The unit vector pointing away from the picture. */
  readonly out: Point;
}

interface Stretch {
  readonly length: number;
  spot(along: number): LoopSpot;
}

const side = (
  from: Point,
  heading: Point,
  out: Point,
  length: number,
): Stretch => ({
  length,
  spot: (along) => ({
    at: [from[0] + heading[0] * along, from[1] + heading[1] * along],
    out,
  }),
});

/** A quarter turn round (cx, cy), starting where the angle is `from`. */
const corner = (cx: number, cy: number, from: number): Stretch => ({
  length: ARC,
  spot: (along) => {
    const angle = from + along / RADIUS;
    const out: Point = [Math.cos(angle), Math.sin(angle)];
    return { at: [cx + out[0] * RADIUS, cy + out[1] * RADIUS], out };
  },
});

const STRETCHES: readonly Stretch[] = [
  side([BOX.left + RADIUS, BOX.top], [1, 0], [0, -1], WIDE),
  corner(BOX.right - RADIUS, BOX.top + RADIUS, -Math.PI / 2),
  side([BOX.right, BOX.top + RADIUS], [0, 1], [1, 0], TALL),
  corner(BOX.right - RADIUS, BOX.bottom - RADIUS, 0),
  side([BOX.right - RADIUS, BOX.bottom], [-1, 0], [0, 1], WIDE),
  corner(BOX.left + RADIUS, BOX.bottom - RADIUS, Math.PI / 2),
  side([BOX.left, BOX.bottom - RADIUS], [0, -1], [-1, 0], TALL),
  corner(BOX.left + RADIUS, BOX.top + RADIUS, Math.PI),
];
const STARTS = STRETCHES.map((_, i) =>
  STRETCHES.slice(0, i).reduce((sum, stretch) => sum + stretch.length, 0),
);

/** A distance round the loop, brought into one turn. */
export const wrapped = (distance: number): number =>
  ((distance % PERIMETER) + PERIMETER) % PERIMETER;

/** The loop at a distance round it; any distance, it goes round and round. */
export function loopSpot(distance: number): LoopSpot {
  const along = wrapped(distance);
  const index = STARTS.findLastIndex((start) => start <= along);
  const stretch = STRETCHES[index] ?? STRETCHES[0];
  if (!stretch) throw new Error("The loop has no stretches");
  return stretch.spot(along - (STARTS[index] ?? 0));
}

/** How far the loop is inside the video's edge, and how round its corners are. */
export const LOOP_INSET = INSET;
export const LOOP_RADIUS = RADIUS;

/** The distance at which each corner is halfway turned. */
export const CORNERS = {
  topLeft: -ARC / 2,
  topRight: WIDE + ARC / 2,
  bottomRight: WIDE + ARC + TALL + ARC / 2,
  bottomLeft: 2 * WIDE + 2 * ARC + TALL + ARC / 2,
} as const;
