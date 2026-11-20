// How the vines grow: leaves along the stems and shoots of stems.ts, and a
// fan of them over each corner. Only shapes and places: paint.ts gives them
// their season's colours.
import {
  FACES,
  inBox,
  inView,
  lerp,
  type Mirror,
  mirrorFor,
  type Origin,
  type Point,
} from "./geometry.ts";
import type { LeafShape } from "./leaves.ts";
import { createRandom, type Random } from "./random.ts";
import {
  FAR,
  hangingShoots,
  mainStems,
  NEAR,
  type Stem,
  tangent,
  tendrils,
} from "./stems.ts";

export interface Leaf {
  /** Where its stalk ends. */
  readonly base: Point;
  /** The direction it points, in radians. */
  readonly angle: number;
  readonly length: number;
  readonly shape: LeafShape;
  /** Which of its season's colours. */
  readonly tone: number;
  readonly young: boolean;
  /** 0 to 1: the lowest hang on when the rest have fallen. */
  readonly hardy: number;
}

export type Stalk = readonly [Point, Point];

export interface Growth {
  /** The thick stems, wound round the frame. */
  readonly stems: readonly Stem[];
  /** Thin shoots and tendrils. */
  readonly shoots: readonly Stem[];
  readonly stalks: readonly Stalk[];
  readonly leaves: readonly Leaf[];
}

const TONES = 5;
/** Half the width of the widest leaf shape (ivy, at its side lobes), per unit of length. */
const HALF_WIDTH = 0.6;
/** A leaf shorter than this is a speck at a tile's size. */
const SMALLEST = 20;
type Placed = Pick<Leaf, "base" | "angle" | "length">;

/** The points a leaf reaches: its stalk end, its tip and its widest sides. */
export function leafExtent({ base, angle, length }: Placed): readonly Point[] {
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const middle: Point = [
    base[0] + dx * length * 0.45,
    base[1] + dy * length * 0.45,
  ];
  const side = (way: number): Point => [
    middle[0] - dy * length * HALF_WIDTH * way,
    middle[1] + dx * length * HALF_WIDTH * way,
  ];
  return [
    base,
    [base[0] + dx * length, base[1] + dy * length],
    side(1),
    side(-1),
  ];
}

/** The largest size up to `size` at which a leaf fits there; 0 if none worth drawing does. */
function fitLeaf(base: Point, angle: number, size: number): number {
  const fits = (length: number): boolean =>
    leafExtent({ base, angle, length })
      .slice(1)
      .every((p) => inView(p, 5) && !inBox(FACES, p));
  return (
    [1, 0.8, 0.62, 0.48]
      .map((k) => size * k)
      .find((length) => length >= SMALLEST && fits(length)) ?? 0
  );
}

interface LeafPlan {
  /** Leaf sizes at the stem's root and at its tip. */
  readonly big: number;
  readonly small: number;
  /** About how far apart. */
  readonly every: number;
  readonly shapes: readonly [LeafShape, ...LeafShape[]];
}

interface Foliage {
  readonly leaves: readonly Leaf[];
  readonly stalks: readonly Stalk[];
}

const NO_FOLIAGE: Foliage = { leaves: [], stalks: [] };
const joined = (parts: readonly Foliage[]): Foliage => ({
  leaves: parts.flatMap((p) => p.leaves),
  stalks: parts.flatMap((p) => p.stalks),
});

const finish = (random: Random, placed: Placed, shape: LeafShape): Leaf => ({
  ...placed,
  shape,
  tone: Math.floor(random.next() * TONES),
  young: shape === "young",
  hardy: random.next(),
});

/** A leaf on one side of the stem at sample `i`, or on the other if it fits only there. */
function leafAt(
  random: Random,
  stem: Stem,
  i: number,
  side: number,
  plan: LeafPlan,
): Foliage {
  const sample = stem[i];
  if (!sample) return NO_FOLIAGE;
  const whole = stem.at(-1)?.along ?? 0;
  const t = whole > 0 ? sample.along / whole : 0;
  const tries = [side, -side].map((way): Placed => {
    const angle = tangent(stem, i) + way * random.between(0.7, 1.35);
    const reach = random.between(8, 20);
    const base: Point = [
      sample.at[0] + Math.cos(angle) * reach,
      sample.at[1] + Math.sin(angle) * reach,
    ];
    const size = lerp(plan.big, plan.small, t) * random.between(0.8, 1.15);
    return { base, angle, length: fitLeaf(base, angle, size) };
  });
  const placed = tries.find((leaf) => leaf.length > 0);
  if (!placed) return NO_FOLIAGE;
  const young = t > 0.8 || placed.length < 40;
  const leaf = finish(
    random,
    placed,
    young ? "young" : random.pick(plan.shapes),
  );
  return { leaves: [leaf], stalks: [[sample.at, placed.base]] };
}

/** Leaves along a stem, on alternate sides, smaller toward its tip. */
function leavesAlong(random: Random, stem: Stem, plan: LeafPlan): Foliage {
  const start = {
    next: random.between(20, 50),
    side: random.next() < 0.5 ? 1 : -1,
    foliage: NO_FOLIAGE,
  };
  return stem.reduce((state, sample, i) => {
    if (sample.along < state.next) return state;
    const next =
      sample.along + random.between(plan.every * 0.7, plan.every * 1.3);
    if (!sample.shown) return { ...state, next };
    const grown = leafAt(random, stem, i, state.side, plan);
    return { next, side: -state.side, foliage: joined([state.foliage, grown]) };
  }, start).foliage;
}

/** A fan of large leaves over a corner, where the stems start. */
function cornerLeaves(
  random: Random,
  corner: Point,
  out: number,
  count: number,
  size: number,
): readonly Leaf[] {
  return Array.from({ length: count }).flatMap((_, i) => {
    const across = count > 1 ? i / (count - 1) : 0.5;
    const angle = out + lerp(-1.25, 1.25, across) + random.between(-0.2, 0.2);
    const base: Point = [
      corner[0] + random.between(-14, 14),
      corner[1] + random.between(-14, 14),
    ];
    const length = fitLeaf(base, angle, size * random.between(0.8, 1.1));
    const shape = random.pick<LeafShape>(["ivy5", "ivy5", "ivy3", "heart"]);
    return length > 0 ? [finish(random, { base, angle, length }, shape)] : [];
  });
}

const LONG: LeafPlan = {
  big: 96,
  small: 50,
  every: 50,
  shapes: ["ivy5", "ivy5", "ivy3", "ivy3", "heart"],
};
const SHORT: LeafPlan = { ...LONG, big: 80, every: 48 };
const SMALL: LeafPlan = {
  big: 46,
  small: 30,
  every: 30,
  shapes: ["heart", "ivy3", "young"],
};

function mirrored(growth: Growth, mirror: Mirror): Growth {
  const stem = (s: Stem): Stem =>
    s.map((q) => ({ ...q, at: mirror.point(q.at) }));
  return {
    stems: growth.stems.map(stem),
    shoots: growth.shoots.map(stem),
    stalks: growth.stalks.map(([a, b]) => [mirror.point(a), mirror.point(b)]),
    leaves: growth.leaves.map((leaf) => ({
      ...leaf,
      base: mirror.point(leaf.base),
      angle: mirror.angle(leaf.angle),
    })),
  };
}

/** One tile's vines, grown from the corner `origin`. */
export function grow(seed: number, origin: Origin): Growth {
  const random = createRandom(seed);
  const stems = mainStems(random);
  const onStems = stems.map((stem, i) =>
    leavesAlong(random, stem, i < 2 ? LONG : SHORT),
  );
  const hanging = hangingShoots(random, stems);
  const onShoots = hanging.map((s) => leavesAlong(random, s, SMALL));
  const curled = tendrils(random, stems);
  const foliage = joined([...onStems, ...onShoots]);
  const corners = [
    ...cornerLeaves(random, NEAR, -Math.PI * 0.75, 6, 100),
    ...cornerLeaves(random, FAR, Math.PI * 0.25, 4, 84),
  ];
  return mirrored(
    {
      stems,
      shoots: [...hanging, ...curled],
      stalks: foliage.stalks,
      leaves: [...foliage.leaves, ...corners],
    },
    mirrorFor(origin),
  );
}
