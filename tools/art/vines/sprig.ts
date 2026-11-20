// Ivy along any path: the dock's own plant (its trunk, boughs, lianas and
// the branch in its free space) grows leaves where growth.ts's frames don't
// reach. Only shapes and places, as there: paint.ts gives them colour.
import { lerp, type Point } from "./geometry.ts";
import { type Growth, type Leaf, leafExtent, type Stalk } from "./growth.ts";
import type { LeafShape } from "./leaves.ts";
import type { Random } from "./random.ts";
import type { Stem } from "./stems.ts";

export interface SprigPlan {
  /** Leaf sizes where the path starts and where it ends. */
  readonly big: number;
  readonly small: number;
  /** About how far apart. */
  readonly every: number;
  /** Whether a leaf may reach this point. */
  readonly keep: (point: Point) => boolean;
  /** Whether the path itself is drawn, as a thin shoot. Yes, unless told not to. */
  readonly shoot?: boolean;
}

const SHAPES: readonly [LeafShape, ...LeafShape[]] = [
  "ivy5",
  "ivy5",
  "ivy3",
  "ivy3",
  "heart",
];
const TONES = 5;
/** A leaf shorter than this is a speck. */
const SMALLEST = 18;
/** A shoot's width where it starts. */
const SHOOT_WIDTH = 3;

interface Spot {
  readonly at: Point;
  /** How far along the path, and the same from 0 to 1. */
  readonly along: number;
  readonly share: number;
  /** The way the path runs here, in radians. */
  readonly heading: number;
}

function spots(points: readonly Point[]): readonly Spot[] {
  const alongs = points.reduce<readonly number[]>((sums, point, i) => {
    const last = points[i - 1];
    const step = last ? Math.hypot(point[0] - last[0], point[1] - last[1]) : 0;
    return [...sums, (sums.at(-1) ?? 0) + step];
  }, []);
  const length = alongs.at(-1) ?? 0;
  const total = length > 0 ? length : 1;
  return points.map((at, i) => {
    const before = points[Math.max(0, i - 1)] ?? at;
    const after = points[Math.min(points.length - 1, i + 1)] ?? at;
    return {
      at,
      along: alongs[i] ?? 0,
      share: (alongs[i] ?? 0) / total,
      heading: Math.atan2(after[1] - before[1], after[0] - before[0]),
    };
  });
}

/** A leaf to one side of a spot, or to the other if it fits only there. */
function leafAt(
  random: Random,
  spot: Spot,
  side: number,
  plan: SprigPlan,
): Leaf | undefined {
  const tries = [side, -side].map((way) => {
    const angle = spot.heading + way * random.between(0.7, 1.35);
    const reach = random.between(8, 20);
    const base: Point = [
      spot.at[0] + Math.cos(angle) * reach,
      spot.at[1] + Math.sin(angle) * reach,
    ];
    const size =
      lerp(plan.big, plan.small, spot.share) * random.between(0.8, 1.15);
    const length = [1, 0.8, 0.62]
      .map((k) => size * k)
      .find(
        (fits) =>
          fits >= SMALLEST &&
          leafExtent({ base, angle, length: fits }).every(plan.keep),
      );
    return { base, angle, length: length ?? 0 };
  });
  const placed = tries.find((leaf) => leaf.length > 0);
  if (!placed) return undefined;
  const young = spot.share > 0.82 || placed.length < 34;
  const shape = young ? "young" : random.pick(SHAPES);
  return {
    ...placed,
    shape,
    tone: Math.floor(random.next() * TONES),
    young,
    hardy: random.next(),
  };
}

/** Leaves along a path, on alternate sides and smaller toward its end. */
export function growAlong(
  random: Random,
  points: readonly Point[],
  plan: SprigPlan,
): Growth {
  const along = spots(points);
  const start = {
    next: random.between(plan.every * 0.3, plan.every),
    side: random.next() < 0.5 ? 1 : -1,
    leaves: [] as readonly Leaf[],
    stalks: [] as readonly Stalk[],
  };
  const grown = along.reduce((state, spot) => {
    if (spot.along < state.next) return state;
    const next =
      spot.along + random.between(plan.every * 0.7, plan.every * 1.3);
    const leaf = leafAt(random, spot, state.side, plan);
    return {
      next,
      side: -state.side,
      leaves: leaf ? [...state.leaves, leaf] : state.leaves,
      stalks: leaf
        ? [...state.stalks, [spot.at, leaf.base] as const]
        : state.stalks,
    };
  }, start);
  const shoot: Stem = along.map((spot) => ({
    at: spot.at,
    along: spot.along,
    shown: true,
    width: lerp(SHOOT_WIDTH, 1.6, spot.share),
  }));
  return {
    stems: [],
    shoots: plan.shoot === false ? [] : [shoot],
    stalks: grown.stalks,
    leaves: grown.leaves,
  };
}
