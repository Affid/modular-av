// The branch that grows off the trunk into the room under the cameras,
// behind them: it forks into thinner and thinner limbs, each leaning back
// toward the light, with ivy on the thin ones. Drawn in three sizes, for
// a little room, some and a lot.
import type { Tone } from "./frame.ts";
import { type Box, type Point } from "./geometry.ts";
import { growthArt, growthDefs } from "./paint.ts";
import {
  BRANCH,
  BRANCH_ROOT,
  type BranchSize,
  PLANT_SHADOW,
  UNITS,
} from "./plant.ts";
import { createRandom, type Random } from "./random.ts";
import { growAlong } from "./sprig.ts";
import {
  type Drawn,
  joined,
  lineThrough,
  picture,
  single,
  twist,
} from "./strands.ts";

const TAU = 2 * Math.PI;
const STEP = 24;
/** Limbs thinner than this are single twigs; the rest are two strands twisted. */
const TWIG = 12;
/** Thinner than this a limb isn't grown. */
const THINNEST = 5.5;

interface Shape {
  readonly seed: number;
  /** The way it leaves the trunk, and the way the light is, in radians. */
  readonly angle: number;
  readonly light: number;
  /** Its first limb's length and thickness. */
  readonly length: number;
  readonly width: number;
}

/** Each size's shape, chosen by eye. */
const SHAPES: Record<BranchSize, Shape> = {
  small: {
    seed: 14,
    angle: Math.PI + 0.55,
    light: Math.PI + 0.45,
    length: 250,
    width: 14,
  },
  medium: {
    seed: 21,
    angle: Math.PI + 0.95,
    light: Math.PI + 0.55,
    length: 470,
    width: 25,
  },
  large: {
    seed: 21,
    angle: Math.PI + 1.3,
    light: Math.PI + 1.15,
    length: 720,
    width: 33,
  },
};

interface Limb {
  readonly points: readonly Point[];
  readonly width: number;
}

interface Growing {
  readonly random: Random;
  readonly light: number;
  readonly inside: (point: Point) => boolean;
}

/** A limb's points: it bends as it goes, leans toward the light, and stops at the picture's edge. */
function reach(
  g: Growing,
  from: Point,
  angle: number,
  length: number,
  width: number,
): { readonly points: readonly Point[]; readonly heading: number } {
  const bend = g.random.between(-0.0016, 0.0016);
  const count = Math.ceil(length / STEP);
  return Array.from({ length: count }, (_, i) => i + 1).reduce(
    (limb, i) => {
      if (limb.stopped) return limb;
      const heading =
        limb.heading +
        bend * STEP +
        0.045 * Math.sin(g.light - limb.heading) +
        0.05 * Math.sin(i * 0.9 + width);
      const last = limb.points.at(-1) ?? from;
      const next: Point = [
        last[0] + Math.cos(heading) * STEP,
        last[1] + Math.sin(heading) * STEP,
      ];
      return g.inside(next)
        ? { ...limb, heading, points: [...limb.points, next] }
        : { ...limb, stopped: true };
    },
    { points: [from] as readonly Point[], heading: angle, stopped: false },
  );
}

/** A limb and all that grows from it: one on from its end, one off its side. */
function grow(
  g: Growing,
  from: Point,
  angle: number,
  length: number,
  width: number,
  turn: number,
): readonly Limb[] {
  if (width < THINNEST || length < 60) return [];
  const { points, heading } = reach(g, from, angle, length, width);
  if (points.length < 4) return [];
  const fork =
    points[Math.floor(points.length * g.random.between(0.42, 0.68))] ?? from;
  const end = points.at(-1) ?? from;
  const on = grow(
    g,
    end,
    heading + g.random.between(-0.3, 0.3),
    length * g.random.between(0.62, 0.8),
    width * 0.7,
    -turn,
  );
  const off = grow(
    g,
    fork,
    heading + turn * g.random.between(0.55, 0.95),
    length * g.random.between(0.5, 0.68),
    width * 0.58,
    -turn,
  );
  return [{ points, width }, ...on, ...off];
}

const TONES: readonly [Tone, Tone] = [
  ["#6f4d2c", "#c49a63"],
  ["#5d3f24", "#b0844f"],
];
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** A limb drawn: a twig as one stroke, a thicker one as two strands that part and close at its ends. */
function drawLimb(random: Random, limb: Limb, index: number): Drawn {
  const id = `g${String(index)}`;
  if (limb.width < TWIG)
    return single(id, limb.points, limb.width, TONES[index % 2] ?? TONES[0]);
  const { line, length } = lineThrough(limb.points);
  const phase = random.between(0, TAU);
  const apart = (d: number): number =>
    limb.width * 0.3 * smooth(d / 60) * smooth((length - d) / 60);
  const turn = (d: number): number => (TAU * d) / (limb.width * 9) + phase;
  return twist(
    id,
    line,
    [
      {
        id: "a",
        width: limb.width * 0.66,
        tone: TONES[0],
        from: 0,
        to: length,
        sway: (d) => apart(d) * Math.sin(turn(d)),
      },
      {
        id: "b",
        width: limb.width * 0.52,
        tone: TONES[1],
        from: 0,
        to: length,
        sway: (d) => apart(d) * Math.sin(turn(d) + Math.PI),
      },
    ],
    [],
    26,
  );
}

/** The branch in a size, the same every time. */
export function drawBranch(size: BranchSize): string {
  const shape = SHAPES[size];
  const random = createRandom(shape.seed);
  const [wide, tall] = [
    BRANCH[size].width * UNITS,
    BRANCH[size].height * UNITS,
  ];
  const box: Box = { left: 0, top: 0, right: wide, bottom: tall };
  const root: Point = [
    wide + BRANCH_ROOT.right * UNITS,
    tall - BRANCH_ROOT.up * UNITS,
  ];
  const inside = ([x, y]: Point): boolean =>
    x > 60 && x < wide + 40 && y > 70 && y < tall - 20;
  const limbs = grow(
    { random, light: shape.light, inside },
    root,
    shape.angle,
    shape.length,
    shape.width,
    1,
  );
  // The thinnest first: a limb lies over what grows from it.
  const drawn = limbs
    .map((limb, index) => ({ limb, index }))
    .toSorted((a, b) => a.limb.width - b.limb.width)
    .map(({ limb, index }) => drawLimb(random, limb, index));
  const keep = ([x, y]: Point): boolean =>
    x > 14 && x < wide - 150 && y > 14 && y < tall - 30;
  const ivy = limbs
    .filter((limb) => limb.width < 15)
    .map((limb) => {
      const thin = limb.width < 8;
      const plan = {
        big: thin ? 86 : 70,
        small: 46,
        every: thin ? 46 : 66,
        keep,
        shoot: false,
      };
      return growthArt(growAlong(random, limb.points, plan), "green");
    });
  return picture(
    box,
    joined([{ defs: growthDefs(box), shadows: "", art: "" }, ...drawn]),
    PLANT_SHADOW,
    ivy.join(""),
  );
}
