// What a camera in a grid hangs on: two lianas of twisted strands that
// come down from the bough (or the camera) above, behind the tile, and
// are tied to its frame with withy. Where nothing is under the camera
// their loose ends hang on, with leaves and a tendril.
import { DARK, type Tone } from "./frame.ts";
import {
  at,
  type Box,
  num,
  type Origin,
  type Point,
  TILE,
  VIEW,
} from "./geometry.ts";
import type { Growth } from "./growth.ts";
import { LOOP_INSET, LOOP_RADIUS } from "./loop.ts";
import type { Outline } from "./outline.ts";
import { SHADOW } from "./outline.ts";
import { growthArt, growthDefs } from "./paint.ts";
import { createRandom, type Random } from "./random.ts";
import { growAlong } from "./sprig.ts";
import type { Stem } from "./stems.ts";
import {
  type Drawn,
  joined,
  type Line,
  lineOf,
  picture,
  type Strand,
  twist,
} from "./strands.ts";
import { svgDocument } from "./svg.ts";

const TAU = 2 * Math.PI;
/** How far above the tile the lianas start: behind whatever hangs there. */
const ABOVE = TILE.top - 530;
const A: Tone = ["#62492a", "#b8935c"];
const B: Tone = ["#4f3a22", "#a07c4a"];

/** Tied to the frame; or loose under it too, long or short. */
export type Hang = "tied" | "loose" | "short";

/** How far the loose ends hang under the tile, at most, by how they hang. */
const REACH: Record<Hang, number> = { tied: 0, loose: 560, short: 250 };

const box = (bottom: number): Box => ({
  left: 0,
  top: ABOVE,
  right: VIEW.width,
  bottom,
});

/** Each picture's box, in the frame's units: as wide as the frame layer, from above the tile. */
export const LIANA_VIEW: Record<Hang, Box> = {
  tied: box(300),
  loose: box(TILE.bottom + REACH.loose + 160),
  short: box(TILE.bottom + REACH.short + 110),
};

/** Where along the top of each corner's frame its two lianas are tied, as shares of the tile's width. */
const TIES: Record<
  Origin,
  { readonly at: readonly [number, number]; readonly seed: number }
> = {
  tl: { at: [0.2, 0.75], seed: 301 },
  tr: { at: [0.27, 0.81], seed: 302 },
  bl: { at: [0.24, 0.7], seed: 303 },
  br: { at: [0.31, 0.78], seed: 304 },
};

export interface Tie {
  /** On the frame's top branch. */
  readonly top: Point;
  /** Where the liana passes its bottom branch. */
  readonly bottom: Point;
}

/** A frame's ties, on its own outline. */
export function tiePoints(outline: Outline, origin: Origin): readonly Tie[] {
  // The loop's distances: along the top from where it straightens, and back along the bottom.
  const straight = TILE.left + LOOP_INSET + LOOP_RADIUS;
  const wide = TILE.right - TILE.left - 2 * (LOOP_INSET + LOOP_RADIUS);
  const tall = TILE.bottom - TILE.top - 2 * (LOOP_INSET + LOOP_RADIUS);
  const arc = (Math.PI / 2) * LOOP_RADIUS;
  return TIES[origin].at.map((share) => {
    const x = TILE.left + share * (TILE.right - TILE.left);
    return {
      top: outline.point(x - straight, 0),
      bottom: outline.point(wide + 2 * arc + tall + (straight + wide - x), 0),
    };
  });
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

interface Hung {
  readonly drawn: Drawn;
  readonly growth: Growth | undefined;
}

/** A tendril off a loose end, curling. */
function tendril(random: Random, tip: Point): Stem {
  const way = random.next() < 0.5 ? 1 : -1;
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const turn = Math.PI / 2 + way * 2.6 * t * t;
    const place: Point = [
      tip[0] + way * 6 * i + 14 * Math.cos(turn) * t,
      tip[1] + 9 * i * (1 - t * 0.6) + 10 * Math.sin(turn) * t,
    ];
    return { at: place, along: i * 10, shown: true, width: 2.6 };
  });
}

/** Where a liana hangs, by distance down from above the tile. */
interface Hanging {
  /** How it sways, and which way its loose end leans. */
  readonly sway: number;
  readonly lean: number;
  /** Where it is tied, where it comes out under the tile, and where it ends. */
  readonly tied: number;
  readonly free: number;
  readonly end: number;
}

/** Its line: swaying a little down to its tie, straight behind the tile, loose under it. */
function hangingLine(tie: Tie, h: Hanging): Line {
  return lineOf((d) => {
    const above =
      9 * Math.sin((TAU * d) / 380 + h.sway) * smooth((h.tied - d) / 120);
    const hung = Math.max(0, d - h.free);
    const below =
      (26 * Math.sin((TAU * hung) / 430 + h.sway) +
        30 * h.lean * (hung / 400)) *
      smooth(hung / 260);
    const behind =
      (tie.bottom[0] - tie.top[0]) * smooth((d - h.tied) / (h.free - h.tied));
    return [tie.top[0] + (d < h.tied ? above : 0) + behind + below, ABOVE + d];
  });
}

/** Its two strands; loose, the thicker one gives out first. */
function hangingStrands(h: Hanging, loose: number): readonly Strand[] {
  const turn = (d: number): number => (TAU * d) / 150 + h.sway;
  return [
    {
      id: "a",
      width: 17,
      tone: A,
      from: -10,
      to: loose > 0 ? h.free + loose * 0.72 : h.end,
      sway: (d) => 7.5 * Math.sin(turn(d)),
    },
    {
      id: "b",
      width: 13,
      tone: B,
      from: -10,
      to: h.end,
      sway: (d) => 7 * Math.sin(turn(d) + Math.PI),
    },
  ];
}

/** One liana: down to its tie, and with `loose` more than nothing, on past the tile for that far. */
function liana(
  random: Random,
  id: string,
  tie: Tie,
  loose: number,
  view: Box,
): Hung {
  const sway = random.between(0, TAU);
  const lean = random.between(-1, 1);
  const [tied, free] = [tie.top[1] - ABOVE, tie.bottom[1] - ABOVE];
  const h: Hanging = {
    sway,
    lean,
    tied,
    free,
    end: loose > 0 ? free + loose : tied + 8,
  };
  const line = hangingLine(tie, h);
  const drawn = twist(id, line, hangingStrands(h, loose), [], 20);
  if (loose <= 0) return { drawn, growth: undefined };
  const keep = ([x, y]: Point): boolean =>
    x > 16 &&
    x < view.right - 16 &&
    y > TILE.bottom + 70 &&
    y < view.bottom - 14;
  const path = Array.from({ length: Math.ceil(loose / 14) + 1 }, (_, i) =>
    line.point(free + i * 14, 0),
  );
  const leaves = growAlong(random, path, {
    big: 78,
    small: 44,
    every: 50,
    keep,
    shoot: false,
  });
  return {
    drawn,
    growth: { ...leaves, shoots: [tendril(random, line.point(h.end, 0))] },
  };
}

/** A frame's two lianas, the same every time for the same frame. */
export function drawLianas(
  outline: Outline,
  origin: Origin,
  hang: Hang,
): string {
  const random = createRandom(TIES[origin].seed);
  const view = LIANA_VIEW[hang];
  // One end hangs further than the other; which, by the frame.
  const share = REACH[hang] / REACH.loose;
  const lengths = [
    random.between(330, 560) * share,
    random.between(190, 400) * share,
  ];
  const longFirst = random.next() < 0.5;
  const hung = tiePoints(outline, origin).map((tie, i) =>
    liana(
      random,
      `h${String(i)}`,
      tie,
      lengths[longFirst ? i : 1 - i] ?? 0,
      view,
    ),
  );
  const growths = hung.flatMap((h) => (h.growth ? [h.growth] : []));
  return picture(
    view,
    joined([
      {
        defs: growths.length > 0 ? growthDefs(view) : "",
        shadows: "",
        art: "",
      },
      ...hung.map((h) => h.drawn),
    ]),
    SHADOW,
    growths.map((growth) => growthArt(growth, "green")).join(""),
  );
}

/** Turns of withy round a point, leaning one way or the other. */
function withy(random: Random, [x, y]: Point, lean: number): string {
  const k = 0.62;
  return Array.from({ length: 4 }, (_, i) => {
    const o = ((i - 1.5) * 7 + random.between(-1.5, 1.5)) * k;
    const from: Point = [x - 30 * k * lean, y + 24 * k + o * 0.5];
    const to: Point = [x + 30 * k * lean, y - 24 * k + o * 0.5];
    const d = `M${at(from)}C${at([x - 12 * k * lean, y - 4 * k + o])} ${at([x + 8 * k * lean, y + 6 * k + o])} ${at(to)}`;
    return (
      `<path d="${d}" stroke="${DARK}" stroke-width="${num(7.5 * k)}"/>` +
      `<path d="${d}" stroke="${i % 2 ? "#9a7a48" : "#86683c"}" stroke-width="${num(5 * k)}"/>` +
      `<path d="${d}" transform="translate(-.8 -1.4)" stroke="#e2c690" stroke-opacity=".55" stroke-width="${num(1.4 * k)}"/>`
    );
  }).join("");
}

/** The withy that ties a frame's lianas to its top branch, to lay over the frame. */
export function drawKnots(outline: Outline, origin: Origin): string {
  const random = createRandom(TIES[origin].seed + 50);
  const art = tiePoints(outline, origin)
    .map((tie, i) => withy(random, tie.top, i % 2 ? -1 : 1))
    .join("");
  return svgDocument(
    `<g fill="none" stroke-linejoin="round" stroke-linecap="round">${art}</g>`,
  );
}
