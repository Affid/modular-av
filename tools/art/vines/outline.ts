// A frame's own outline: how its bundle of branches wanders in and out on
// its way round the loop, so that no frame is a rectangle and no two are
// alike. The bundle only ever leans into the picture's margin.
import { COVER, type Point, SIDES, TILE } from "./geometry.ts";
import {
  CORNERS,
  LOOP_INSET,
  LOOP_RADIUS,
  loopSpot,
  PERIMETER,
  wrapped,
} from "./loop.ts";
import { createRandom } from "./random.ts";

/** Half the bundle where it is thickest, ivy stems wound round it included. */
export const BUNDLE_HALF = 34;
/** Kept spare beside the bundle, for its ripples. */
const SPARE = 10;
/**
 * How far the bundle's shadow falls past it, down and to the right: the
 * top and left of the frame keep that much further from the picture's middle.
 */
export const SHADOW = { dx: 3, dy: 6, blur: 4.5 } as const;
const SHADOW_REACH = Math.hypot(SHADOW.dx, SHADOW.dy) + 2 * SHADOW.blur;
const TAU = 2 * Math.PI;

export interface Outline {
  /** The point `off` units out from the bundle's centre line, `distance` round the loop. */
  point(distance: number, off: number): Point;
  /** How far inside the plain loop the bundle's centre runs there. */
  depth(distance: number): number;
}

/**
 * From the plain loop in to where the picture's middle begins: less from
 * the top and bottom than from the sides, as the picture is 16:9.
 */
export function coverDepth(distance: number): number {
  const { out } = loopSpot(distance);
  const fromSide = COVER * (TILE.right - TILE.left) - LOOP_INSET;
  const fromTop = COVER * (TILE.bottom - TILE.top) - LOOP_INSET;
  return fromTop + (fromSide - fromTop) * out[0] * out[0];
}

const smoothstep = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const awayFrom =
  (corner: Point, reach: number) =>
  ([x, y]: Point): number =>
    smoothstep(Math.hypot(x - corner[0], y - corner[1]) / reach);
/** The player's name sits in the bottom left corner, the tile's menu in the top right. */
const fromName = awayFrom([TILE.left, TILE.bottom], 330);
const fromMenu = awayFrom([TILE.right, TILE.top], 210);

/** How far in the bundle's centre may go: calmer round a corner, and where the dock puts things. */
function room(distance: number): number {
  const { at, out } = loopSpot(distance);
  const length = Math.hypot(SHADOW.dx, SHADOW.dy);
  // How squarely the shadow falls into the picture from this side: 0 to 1.
  const facing = Math.max(
    0,
    -(out[0] * SHADOW.dx + out[1] * SHADOW.dy) / length,
  );
  const taken = BUNDLE_HALF + SPARE + SHADOW_REACH * facing;
  const free = Math.max(0, coverDepth(distance) - taken);
  // Further in than a corner's own curve and the bundle would loop on itself.
  const turning = Math.abs(2 * out[0] * out[1]);
  const round = free + (Math.min(free, LOOP_RADIUS / 2) - free) * turning;
  return round * (0.25 + 0.75 * fromName(at)) * (0.45 + 0.55 * fromMenu(at));
}

/** Slow waves round the loop, and small ripples: [turns, size]. */
const WAVES = [
  [1, 0.5],
  [2, 0.9],
  [3, 0.8],
  [4, 0.6],
  [5, 0.4],
  [7, 0.25],
] as const;
const RIPPLES = [
  [9, 4.2],
  [13, 2.8],
  [19, 1.8],
] as const;
const SAMPLES = 720;
const STEPS = Array.from(
  { length: SAMPLES },
  (_, i) => (PERIMETER * i) / SAMPLES,
);
const REACH = Array.from({ length: 45 }, (_, i) => i - 22);

/** Each value as the mean of its neighbours round the loop. */
const smoothed = (values: readonly number[]): readonly number[] =>
  values.map(
    (_, i) =>
      REACH.reduce(
        (sum, k) => sum + (values[(i + k + SAMPLES) % SAMPLES] ?? 0),
        0,
      ) / REACH.length,
  );

type Wave = readonly [turns: number, size: number, phase: number];
const sumOf = (waves: readonly Wave[], distance: number): number =>
  waves.reduce(
    (sum, [turns, size, phase]) =>
      sum + size * Math.sin((TAU * turns * distance) / PERIMETER + phase),
    0,
  );

/** The depths of an outline at each sample: a few bulges, smooth, within the room there is. */
function bulges(waves: readonly Wave[]): readonly number[] {
  const raw = STEPS.map((distance) => sumOf(waves, distance));
  const [low, high] = [Math.min(...raw), Math.max(...raw)];
  const rough = STEPS.map(
    (distance, i) =>
      room(distance) * (((raw[i] ?? low) - low) / (high - low || 1)) ** 1.5,
  );
  const soft = smoothed(smoothed(rough));
  // Smoothing flattens the bulges: the deepest gets nearly all its room back.
  const fill = Math.max(
    ...soft.map((depth, i) => depth / Math.max(1, room(STEPS[i] ?? 0))),
  );
  return soft.map((depth) => (depth * 0.95) / (fill || 1));
}

/** A frame's outline, the same every time for the same seed. */
export function createOutline(seed: number): Outline {
  const random = createRandom(seed);
  const phased = (
    waves: readonly (readonly [number, number])[],
  ): readonly Wave[] =>
    waves.map(([turns, size]) => [turns, size, random.between(0, TAU)]);
  const depths = bulges(phased(WAVES));
  const ripples = phased(RIPPLES);
  const depth = (distance: number): number => {
    const sample = (wrapped(distance) / PERIMETER) * SAMPLES;
    const i = Math.floor(sample);
    const [a, b] = [depths[i % SAMPLES] ?? 0, depths[(i + 1) % SAMPLES] ?? 0];
    return a + (b - a) * (sample - i);
  };
  return {
    depth,
    point(distance, off) {
      const { at, out } = loopSpot(distance);
      const shift = off - depth(distance) + sumOf(ripples, distance);
      return [at[0] + out[0] * shift, at[1] + out[1] * shift];
    },
  };
}

/** The loop itself, with no wandering: a plain rounded frame. */
export const PLAIN_OUTLINE: Outline = {
  depth: () => 0,
  point(distance, off) {
    const { at, out } = loopSpot(distance);
    return [at[0] + out[0] * off, at[1] + out[1] * off];
  },
};

export interface Bent {
  readonly at: Point;
  /** How far a direction turns on the way, in radians. */
  readonly turn: number;
}

/**
 * Bends what was grown round the straight frame (the rectangle of `SIDES`)
 * onto an outline: a point keeps its place along its side and its distance
 * from the frame's centre line.
 */
export function bendOnto(outline: Outline): (point: Point) => Bent {
  const wide = SIDES.right - SIDES.left;
  const tall = SIDES.bottom - SIDES.top;
  const round = { ...CORNERS, back: PERIMETER + CORNERS.topLeft };
  return ([x, y]) => {
    const sides = [
      onSide(
        SIDES.top - y,
        x - SIDES.left,
        wide,
        [round.topLeft, round.topRight],
        -Math.PI / 2,
      ),
      onSide(
        x - SIDES.right,
        y - SIDES.top,
        tall,
        [round.topRight, round.bottomRight],
        0,
      ),
      onSide(
        y - SIDES.bottom,
        SIDES.right - x,
        wide,
        [round.bottomRight, round.bottomLeft],
        Math.PI / 2,
      ),
      onSide(
        SIDES.left - x,
        SIDES.bottom - y,
        tall,
        [round.bottomLeft, round.back],
        Math.PI,
      ),
    ];
    // The side it is furthest out from: the nearest, for a point inside.
    const side = sides.reduce((best, next) =>
      next.off > best.off ? next : best,
    );
    const { out } = loopSpot(side.at);
    const turn = Math.atan2(out[1], out[0]) - side.was;
    return {
      at: outline.point(side.at, side.off),
      // The short way round.
      turn: Math.atan2(Math.sin(turn), Math.cos(turn)),
    };
  };
}

/** Within this far of a corner, a point inside the frame is drawn towards it. */
const CORNER_PULL = 120;

interface OnSide {
  /** How far out from the side: negative inside the frame. */
  readonly off: number;
  /** The distance round the loop it comes to. */
  readonly at: number;
  /** The way out from that side of the straight frame, in radians. */
  readonly was: number;
}

/**
 * A point as one side of the straight frame sees it: `off` out from it and
 * `along` it from its first corner. Past either end is that corner. Inside
 * the frame near a corner two sides claim a point: each gives way along
 * itself by the point's depth, so that they agree on the corner's diagonal.
 */
function onSide(
  off: number,
  along: number,
  length: number,
  [from, to]: readonly [number, number],
  was: number,
): OnSide {
  const depth = Math.max(0, -off);
  const pulled = (fromCorner: number): number => {
    const share = 1 - (fromCorner - depth) / CORNER_PULL;
    return fromCorner - depth * Math.min(1, Math.max(0, share));
  };
  const place =
    along <= length / 2 ? pulled(along) : length - pulled(length - along);
  const share = Math.min(1, Math.max(0, place / length));
  return { off, at: from + (to - from) * share, was };
}
