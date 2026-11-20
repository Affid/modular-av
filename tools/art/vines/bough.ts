// A bough off the trunk: thinner strands twisted the same way, drawn as one
// picture a stylesheet cuts in three. Its right end rises from under the
// trunk; its middle repeats, so the bough can be as long as the dock is
// wide; its tip thins out, one strand ending after another, and curls.
import type { Sway, Tone } from "./frame.ts";
import { type Box, type Point } from "./geometry.ts";
import { growthArt, growthDefs } from "./paint.ts";
import { BOUGH, PLANT_SHADOW, UNITS } from "./plant.ts";
import { createRandom } from "./random.ts";
import { growAlong } from "./sprig.ts";
import {
  joined,
  type Line,
  lineOf,
  picture,
  type Strand,
  twist,
} from "./strands.ts";

const TAU = 2 * Math.PI;
const JOINT = BOUGH.joint * UNITS;
const MIDDLE = BOUGH.period * UNITS;
const TIP = BOUGH.tip * UNITS;
const WIDE = JOINT + MIDDLE + TIP;
const TALL = BOUGH.height * UNITS;
const LEVEL = TALL / 2;
/** The strands are sampled this far apart: a whole number of times the middle. */
const STEP = MIDDLE / 24;
/** How far under the trunk the strands start. */
const UNDER = 2 * STEP;
/** Past the middle by this much the strands are still as in it: the curve at a cut bends by its neighbours. */
const SETTLED = 2 * STEP;
/** Where the tip turns, measured from the trunk, and how tightly. */
const TURN = WIDE - 70;
const RADIUS = 38;

export interface BoughSpec {
  readonly seed: number;
  /** A main bough of four strands, or a lesser one of three. */
  readonly thick: boolean;
  /** Which way its tip curls. */
  readonly curl: "up" | "down";
  /** Ivy on its tip, and how far its leaves may reach above and below it. */
  readonly leaves?: { readonly above: number; readonly below: number };
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** From under the trunk at the right, level through the middle, to a tip that curls. */
function centreLine(curl: number): Line {
  return lineOf((d) => {
    // It leaves the trunk from lower down and is level before the middle.
    const level = LEVEL + 44 * (1 - smooth((d + 30) / 170));
    if (d <= TURN) return [WIDE - d, level];
    const turned = (d - TURN) / RADIUS;
    return [
      WIDE - TURN - RADIUS * Math.sin(turned),
      level + curl * RADIUS * (1 - Math.cos(turned)),
    ];
  });
}

/** A strand's end, on the grid its path is sampled on. */
const onGrid = (distance: number): number =>
  Math.round((distance + UNDER) / STEP) * STEP - UNDER;

/** How far a strand sways still, past the middle: it fades toward the tip. */
const fade = (d: number): number =>
  1 - 0.5 * smooth((d - JOINT - MIDDLE - SETTLED) / 250);

/** A wave that fits the middle `turns` times. */
const wave = (turns: number, d: number): number =>
  (TAU * turns * (d - JOINT)) / MIDDLE;

/** A strand from one distance to another, its end on the grid its path is sampled on. */
const strand = (
  id: string,
  width: number,
  tone: Tone,
  ends: readonly [number, number],
  sway: Sway,
): Strand => ({ id, width, tone, from: ends[0], to: onGrid(ends[1]), sway });

/**
 * The strands. Through the middle each is a plain wave that fits it a
 * whole number of times; only past it do they fade and end, the thickest
 * first. A main bough has a fourth, thin one.
 */
function strands(thick: boolean): readonly Strand[] {
  const k = thick ? 1.3 : 0.85;
  const past = JOINT + MIDDLE;
  const curl: Sway = (d) =>
    12 * k * fade(d) * (1 - smooth((d - (TURN - 110)) / 90));
  const three = [
    strand(
      "a",
      22 * k,
      ["#6f4d2c", "#c49a63"],
      [-UNDER, past + 150],
      (d) => 9 * k * fade(d) * Math.sin(wave(2, d)),
    ),
    strand(
      "b",
      18 * k,
      ["#5d3f24", "#b0844f"],
      [-UNDER, past + 250],
      (d) => 8 * k * fade(d) * Math.sin(wave(2, d) + Math.PI),
    ),
    strand(
      "c",
      10 * k,
      ["#7a5a36", "#d0aa74"],
      [-UNDER, TURN + RADIUS * 2.1],
      (d) => curl(d) * Math.sin(wave(3, d) + 1.3),
    ),
  ];
  const fourth = strand(
    "d",
    7,
    ["#4f3620", "#a47c4b"],
    [STEP, past + 75],
    (d) => 10 * fade(d) * Math.sin(wave(4, d) + 4),
  );
  return thick ? [...three, fourth] : three;
}

/** Ivy on the tip: nothing of it in the middle, which stretches, or across a cut. */
function ivy(spec: BoughSpec, line: Line, k: number): string {
  if (!spec.leaves) return "";
  const random = createRandom(spec.seed + 1000);
  const { above, below } = spec.leaves;
  const keep = ([x, y]: Point): boolean =>
    x > 14 &&
    x < TIP - 14 &&
    y > Math.max(6, LEVEL - above) &&
    y < Math.min(TALL - 6, LEVEL + below);
  const from = JOINT + MIDDLE + random.between(40, 90);
  const length = random.between(220, 300);
  const phase = random.between(0, TAU);
  const path = Array.from({ length: Math.ceil(length / 14) + 1 }, (_, i) => {
    const d = from + i * 14;
    return line.point(d, 13 * k * Math.sin((TAU * d) / 170 + phase));
  });
  return growthArt(
    growAlong(random, path, { big: 58, small: 38, every: 46, keep }),
    "green",
  );
}

/** A bough's picture, the same every time for the same spec. */
export function drawBough(spec: BoughSpec): string {
  const box: Box = { left: 0, top: 0, right: WIDE, bottom: TALL };
  const line = centreLine(spec.curl === "up" ? -1 : 1);
  const drawn = twist("b", line, strands(spec.thick), [], STEP);
  const leaves = ivy(spec, line, spec.thick ? 1.3 : 0.85);
  return picture(
    box,
    joined([
      { defs: leaves ? growthDefs(box) : "", shadows: "", art: "" },
      drawn,
    ]),
    PLANT_SHADOW,
    leaves,
    { width: WIDE / UNITS, height: BOUGH.height },
  );
}
