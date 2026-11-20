// The dock's main branch: thick strands twisted like a frame's, drawn as
// one tile that repeats along the dock's free edge. Mostly even, with what
// a real branch has: it wanders a little, shorter branches leave it and
// come back, twigs are cut off it, and ivy climbs some stretches of it.
import { type Branch, type Sway, type Tone, twigArt } from "./frame.ts";
import { type Box, curve, type Point, whole } from "./geometry.ts";
import { growthArt, growthDefs } from "./paint.ts";
import { PLANT_SHADOW, TRUNK, UNITS } from "./plant.ts";
import { createRandom, type Random } from "./random.ts";
import { growAlong } from "./sprig.ts";
import {
  type Drawn,
  joined,
  type Line,
  lineOf,
  picture,
  type Strand,
  twist,
} from "./strands.ts";

const TAU = 2 * Math.PI;
const WIDE = TRUNK.width * UNITS;
const LONG = TRUNK.period * UNITS;
/** The strands' paths are sampled this far apart: a whole number of times a period. */
const STEP = LONG / 80;
/** They run this far past both ends of the tile, so they meet across the seam. */
const PAST = 4 * STEP;
/** Nothing that can't repeat (a leaf, a twig) comes this near the seam. */
const SEAM = 36;

/** Down the dock's side, its free edge to the right; or across its top. */
export type TrunkWay = "down" | "across";

/** A wave that fits the tile a whole number of times. */
function slow(random: Random, turns: number): Sway {
  const phase = random.between(0, TAU);
  return (distance) => Math.sin((TAU * turns * distance) / LONG + phase);
}

/** The trunk's centre line: it wanders a little, and comes back each period. */
function centreLine(random: Random, way: TrunkWay): Line {
  const [wander, wobble] = [slow(random, 1), slow(random, 3)];
  const off = (distance: number): number =>
    5 * wander(distance) + 2.5 * wobble(distance);
  return way === "down"
    ? lineOf((d) => [(TRUNK.width - TRUNK.centre) * UNITS + off(d), d])
    : lineOf((d) => [d, TRUNK.centre * UNITS + off(d)]);
}

/** Two thick strands twisted round each other, and two thin ones through them. */
function strands(random: Random): readonly Strand[] {
  const [drift, flutter, lag, swell, ebb] = [1, 3, 2, 2, 3].map((turns) =>
    slow(random, turns),
  );
  const wave = (turns: number, d: number): number => (TAU * turns * d) / LONG;
  const weave: Sway = (d) =>
    wave(4, d) + 0.9 * (drift?.(d) ?? 0) + 0.5 * (flutter?.(d) ?? 0);
  const whole = { from: -PAST, to: LONG + PAST };
  const strand = (
    id: string,
    width: number,
    tone: Tone,
    sway: Sway,
  ): Strand => ({
    id,
    width,
    tone,
    ...whole,
    sway,
  });
  return [
    strand(
      "a",
      34,
      ["#6f4d2c", "#c49a63"],
      (d) => (14 + 4 * (swell?.(d) ?? 0)) * Math.sin(weave(d)),
    ),
    strand(
      "b",
      28,
      ["#5d3f24", "#b0844f"],
      (d) =>
        (13 + 4 * (ebb?.(d) ?? 0)) *
        Math.sin(weave(d) + Math.PI + 0.8 * (lag?.(d) ?? 0)),
    ),
    strand(
      "c",
      13,
      ["#7a5a36", "#d0aa74"],
      (d) => 22 * Math.sin(wave(7, d) + 1.3 + 0.8 * (flutter?.(d) ?? 0)),
    ),
    strand(
      "d",
      10,
      ["#4f3620", "#a47c4b"],
      (d) => 19 * Math.sin(wave(5, d) + 4 + 0.9 * (drift?.(d) ?? 0)),
    ),
  ];
}

const SIDE_TONES: readonly Tone[] = [
  ["#584027", "#a9804e"],
  ["#6a4a2a", "#bf9660"],
];

/** Shorter branches that leave the trunk and come back: into the dock, further; out of it, a little. */
function sideBranches(random: Random, line: Line): readonly Branch[] {
  const count = 5;
  return Array.from({ length: count }, (_, i) => {
    const length = random.between(0.07, 0.13) * LONG;
    const room = LONG - 2 * SEAM - length;
    const from = SEAM + (room * (i + random.between(0.1, 0.9))) / count;
    const reach = i % 2 === 0 ? random.between(22, 34) : -random.between(8, 13);
    const wobble = random.between(0, TAU);
    const steps = Math.ceil(length / 26);
    const points = Array.from({ length: steps + 1 }, (_, k): Point => {
      const t = k / steps;
      const arch = Math.sin(Math.PI * t);
      return line.point(
        from + length * t,
        reach * arch ** 0.7 + 4 * Math.sin(TAU * 2 * t + wobble) * arch,
      );
    });
    return {
      id: `s${String(i)}`,
      width: random.between(13, 19),
      tone: SIDE_TONES[i % SIDE_TONES.length] ?? ["#6a4a2a", "#bf9660"],
      d: curve(points, whole),
    };
  });
}

/** Twigs cut off pale, pointing into the dock and back along the trunk. */
function twigs(random: Random, line: Line): string {
  const count = 4;
  return Array.from({ length: count }, (_, i) => {
    const room = LONG - 4 * SEAM;
    const at = 2 * SEAM + (room * (i + random.between(0.15, 0.85))) / count;
    const [on, inward, back] = [
      line.point(at, 0),
      line.point(at, 1),
      line.point(at - 1, 0),
    ];
    const lean = random.between(0.5, 1.2);
    const way: Point = [
      (inward[0] - on[0]) * Math.sin(lean) + (back[0] - on[0]) * Math.cos(lean),
      (inward[1] - on[1]) * Math.sin(lean) + (back[1] - on[1]) * Math.cos(lean),
    ];
    return twigArt(
      line.point(at, 12),
      way,
      random.between(40, 62),
      random.between(-9, 9),
    );
  }).join("");
}

/** The stretches ivy climbs, as shares of the tile: the rest is bare. */
const IVY: readonly (readonly [number, number])[] = [
  [0.08, 0.36],
  [0.56, 0.85],
];

/** Ivy winding over the trunk; no leaf leaves the tile or comes near its seam. */
function ivy(random: Random, line: Line, way: TrunkWay): string {
  const keep = ([x, y]: Point): boolean => {
    const [alongIt, acrossIt] = way === "down" ? [y, x] : [x, y];
    return (
      alongIt > SEAM &&
      alongIt < LONG - SEAM &&
      acrossIt > 10 &&
      acrossIt < WIDE - 8
    );
  };
  return IVY.map(([from, to]) => {
    const phase = random.between(0, TAU);
    const count = Math.ceil(((to - from) * LONG) / 14);
    const path = Array.from({ length: count + 1 }, (_, i) => {
      const d = from * LONG + i * 14;
      return line.point(d, 24 * Math.sin((TAU * d) / 270 + phase));
    });
    const grown = growAlong(random, path, {
      big: 78,
      small: 46,
      every: 62,
      keep,
    });
    return growthArt(grown, "green");
  }).join("");
}

/** One tile of the trunk, the same every time for the same seed. */
export function drawTrunk(seed: number, way: TrunkWay): string {
  const random = createRandom(seed);
  const box: Box =
    way === "down"
      ? { left: 0, top: 0, right: WIDE, bottom: LONG }
      : { left: 0, top: 0, right: LONG, bottom: WIDE };
  const line = centreLine(random, way);
  const woven = strands(random);
  const sides = sideBranches(random, line);
  const under: Drawn = {
    defs: growthDefs(box),
    shadows: "",
    art: twigs(random, line),
  };
  return picture(
    box,
    joined([under, twist("t", line, woven, sides, STEP)]),
    PLANT_SHADOW,
    ivy(random, line, way),
  );
}
