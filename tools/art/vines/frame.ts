// The frame: branches twisted together along each side, their ends crossing
// at the corners, where thin withies bind them.
import {
  at,
  blurFilter,
  curve,
  num,
  type Point,
  SIDES,
  THICKNESS,
  whole,
} from "./geometry.ts";
import { createRandom, type Random } from "./random.ts";
import { svgDocument } from "./svg.ts";

/** How far a side runs past the side it crosses. */
const OVERHANG = 44;
const BRANCH = 25;
const WITHY = 11;
const STEP = 30;
const DARK = "#1b1108";

interface Side {
  readonly id: string;
  readonly from: Point;
  /** The unit vector the side runs along. */
  readonly along: Point;
  readonly length: number;
}

interface Wave {
  readonly period: number;
  readonly phase: number;
  readonly amp: number;
}

/** Body and highlight of each strand: two branches and a withy. */
const TONES = {
  a: ["#6f4d2c", "#c49a63"],
  b: ["#5d3f24", "#b0844f"],
  c: ["#7a5a36", "#d0aa74"],
} as const;

/** The uprights first: the horizontal branches lie over them. */
function sides(): readonly Side[] {
  const past = OVERHANG + THICKNESS / 2;
  const tall = SIDES.bottom - SIDES.top + 2 * past;
  const wide = SIDES.right - SIDES.left + 2 * past;
  return [
    {
      id: "l",
      from: [SIDES.left, SIDES.top - past],
      along: [0, 1],
      length: tall,
    },
    {
      id: "r",
      from: [SIDES.right, SIDES.top - past],
      along: [0, 1],
      length: tall,
    },
    {
      id: "t",
      from: [SIDES.left - past, SIDES.top],
      along: [1, 0],
      length: wide,
    },
    {
      id: "b",
      from: [SIDES.left - past, SIDES.bottom],
      along: [1, 0],
      length: wide,
    },
  ];
}

/** A point `along` a side and `across` it. */
const place = (side: Side, along: number, across: number): Point => [
  side.from[0] + side.along[0] * along - side.along[1] * across,
  side.from[1] + side.along[1] * along + side.along[0] * across,
];

/** One strand: it weaves across the side's centre line. */
function strand(side: Side, wave: Wave, shift: number): readonly Point[] {
  const count = Math.ceil(side.length / STEP);
  return Array.from({ length: count + 1 }, (_, i) => {
    const along = (side.length * i) / count;
    const weave =
      wave.amp *
      Math.sin((2 * Math.PI * along) / wave.period + wave.phase + shift);
    const wander = 3 * Math.sin(along / 97 + wave.phase * 3);
    return place(side, along, weave + wander);
  });
}

const stroke = (id: string, attributes: string): string =>
  `<use href="#${id}" ${attributes}/>`;

/** A strand painted as a round branch: outline, body, shade, light, grain. */
function bark(
  id: string,
  width: number,
  tone: readonly [string, string],
): string {
  const moved = (dx: number, dy: number): string =>
    `transform="translate(${num(width * dx)} ${num(width * dy)})"`;
  return (
    stroke(id, `stroke="${DARK}" stroke-width="${num(width + 4)}"`) +
    stroke(id, `stroke="${tone[0]}" stroke-width="${num(width)}"`) +
    stroke(
      id,
      `stroke="${DARK}" stroke-opacity=".45" stroke-width="${num(width * 0.42)}" ${moved(0.14, 0.2)}`,
    ) +
    stroke(
      id,
      `stroke="${tone[1]}" stroke-opacity=".7" stroke-width="${num(width * 0.24)}" ${moved(-0.16, -0.22)}`,
    ) +
    stroke(
      id,
      `stroke="${DARK}" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="22 9 6 14 34 11" ${moved(0.02, 0.05)}`,
    ) +
    stroke(
      id,
      `stroke="${DARK}" stroke-opacity=".35" stroke-width="1.3" stroke-dasharray="14 12 30 8" ${moved(-0.3, -0.3)}`,
    ) +
    stroke(
      id,
      `stroke="${tone[1]}" stroke-opacity=".3" stroke-width="1.3" stroke-dasharray="26 16 9 12" ${moved(0.3, 0.32)}`,
    )
  );
}

/**
 * The stretches where the first branch passes over the second: the branches
 * cross where the weave is at zero, and each takes every other crossing.
 */
function overWindows(side: Side, wave: Wave): string {
  const half = wave.period * 0.19;
  const first = Math.ceil(wave.phase / Math.PI);
  const last = Math.floor(
    (2 * Math.PI * side.length) / wave.period / Math.PI + wave.phase / Math.PI,
  );
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
    .filter((n) => n % 2 === 0)
    .map((n) => {
      const along = ((n * Math.PI - wave.phase) * wave.period) / (2 * Math.PI);
      const corner = place(
        side,
        along - half,
        side.along[0] ? -THICKNESS : THICKNESS,
      );
      const [w, h] = side.along[0]
        ? [2 * half, 2 * THICKNESS]
        : [2 * THICKNESS, 2 * half];
      return `<rect x="${whole(corner[0])}" y="${whole(corner[1])}" width="${whole(w)}" height="${whole(h)}"/>`;
    })
    .join("");
}

/** The pale cut at both ends of a branch. */
function cutEnds(side: Side, points: readonly Point[]): string {
  const [along, across] = [3.2, BRANCH / 2];
  const [rx, ry] = side.along[0] ? [along, across] : [across, along];
  return [points[0], points.at(-1)]
    .flatMap((p) => (p ? [p] : []))
    .map(
      (p) =>
        `<ellipse cx="${whole(p[0])}" cy="${whole(p[1])}" rx="${rx}" ry="${ry}" fill="#d9bb86" stroke="${DARK}" stroke-width="1.4"/>`,
    )
    .join("");
}

interface DrawnSide {
  readonly defs: string;
  /** The strands, to be stroked without a fill. */
  readonly strokes: string;
  /** The pale cuts at the branches' ends. */
  readonly ends: string;
}

function drawSide(side: Side, random: Random): DrawnSide {
  const wave = {
    period: random.between(215, 265),
    phase: random.between(0, 6),
    amp: 13.5,
  };
  const withy = {
    period: wave.period * 0.61,
    phase: wave.phase + 1.3,
    amp: 17,
  };
  const strands = {
    a: strand(side, wave, 0),
    b: strand(side, wave, Math.PI),
    c: strand(side, withy, 0),
  };
  const id = (k: string): string => `s${side.id}${k}`;
  const defs =
    Object.entries(strands)
      .map(([k, points]) => `<path id="${id(k)}" d="${curve(points, whole)}"/>`)
      .join("") +
    `<clipPath id="o${side.id}">${overWindows(side, wave)}</clipPath>`;
  const strokes =
    `<g filter="url(#fs)" opacity=".55" transform="translate(5 9)" stroke="#000" stroke-width="${BRANCH}">${stroke(id("a"), "")}${stroke(id("b"), "")}</g>` +
    bark(id("a"), BRANCH, TONES.a) +
    bark(id("b"), BRANCH, TONES.b) +
    `<g clip-path="url(#o${side.id})">${bark(id("a"), BRANCH, TONES.a)}</g>` +
    bark(id("c"), WITHY, TONES.c);
  const ends = cutEnds(side, strands.a) + cutEnds(side, strands.b);
  return { defs, strokes, ends };
}

/** Five turns of withy round a corner, where two sides cross. */
function binding([x, y]: Point, random: Random): string {
  return Array.from({ length: 5 }, (_, i) => {
    const o = (i - 2) * 7 + random.between(-1.5, 1.5);
    const d = `M${at([x - 30, y + 24 + o * 0.5])}C${at([x - 12, y - 4 + o])} ${at([x + 8, y + 6 + o])} ${at([x + 30, y - 24 + o * 0.5])}`;
    return (
      `<path d="${d}" stroke="${DARK}" stroke-width="7.5"/>` +
      `<path d="${d}" stroke="${i % 2 ? "#9a7a48" : "#86683c"}" stroke-width="5"/>` +
      `<path d="${d}" transform="translate(-.8 -1.4)" stroke="#e2c690" stroke-opacity=".55" stroke-width="1.4"/>`
    );
  }).join("");
}

/** The woven frame, as an SVG that fills the frame layer. */
export function wovenFrame(seed = 9): string {
  const random = createRandom(seed);
  const drawn = sides().map((side) => drawSide(side, random));
  const corners: readonly Point[] = [
    [SIDES.left, SIDES.top],
    [SIDES.left, SIDES.bottom],
    [SIDES.right, SIDES.top],
    [SIDES.right, SIDES.bottom],
  ];
  return svgDocument(
    `<defs>${drawn.map((d) => d.defs).join("")}${blurFilter("fs", 6)}</defs>` +
      drawn
        .map(
          (d) =>
            `<g fill="none" stroke-linejoin="round">${d.strokes}</g>${d.ends}`,
        )
        .join("") +
      `<g fill="none" stroke-linecap="round">${corners.map((c) => binding(c, random)).join("")}</g>`,
  );
}
