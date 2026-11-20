// One cell of the lattice that cameras in a grid sit in. Every tile draws
// the same cell, and neighbours' cells overlap by a side, so the branch
// between two cameras is one branch. The opposite sides of a cell are the
// same picture for that reason, and every branch ends at a corner, where
// four cells' branches meet under a binding of withy.
import {
  at,
  blurFilter,
  curve,
  GRID_VIEW,
  num,
  type Point,
  SIDES,
  whole,
} from "./geometry.ts";
import {
  bark,
  type Branch,
  DARK,
  defined,
  stroke,
  type Sway,
  type Tone,
} from "./frame.ts";
import { SHADOW } from "./outline.ts";
import { createRandom, type Random } from "./random.ts";
import { svgDocument } from "./svg.ts";

const STEP = 26;
const TAU = 2 * Math.PI;
const WIDE = SIDES.right - SIDES.left;
const TALL = SIDES.bottom - SIDES.top;
const CORNER: Point = [SIDES.left, SIDES.top];

/** A side of the cell and, the same picture, the side opposite. */
interface Rail {
  readonly id: string;
  /** The unit vector it runs along, from the top left corner. */
  readonly along: Point;
  readonly length: number;
  /** From it to its twin. */
  readonly twin: Point;
}

const RAILS: readonly Rail[] = [
  // The uprights first: the horizontal branches lie over them.
  { id: "l", along: [0, 1], length: TALL, twin: [WIDE, 0] },
  { id: "t", along: [1, 0], length: WIDE, twin: [0, TALL] },
];

/** The point `off` to the side of a rail, `distance` along it. */
const onRail = (rail: Rail, distance: number, off: number): Point => [
  CORNER[0] + rail.along[0] * distance - rail.along[1] * off,
  CORNER[1] + rail.along[1] * distance + rail.along[0] * off,
];

/** A slow wave along a rail that is nothing at both its ends. */
function settling(random: Random, length: number, turns: number): Sway {
  const phase = random.between(0, TAU);
  return (distance) =>
    Math.sin((TAU * turns * distance) / length + phase) *
    Math.sin((Math.PI * distance) / length);
}

interface Strand {
  readonly id: string;
  readonly width: number;
  readonly tone: Tone;
  readonly sway: Sway;
}

/**
 * Two thick branches twisted round each other, and two thin ones through
 * them, all through both corners: whole half-waves fit the rail, and what
 * makes the weave uneven dies away toward its ends.
 */
function strands(random: Random, rail: Rail): readonly Strand[] {
  const { length } = rail;
  const [drift, lag, swell, ebb] = [2, 3, 4, 5].map((turns) =>
    settling(random, length, turns),
  );
  const wave = (halves: number, d: number): number =>
    (Math.PI * halves * d) / length;
  const thick = Math.round(length / 120);
  return [
    {
      id: "a",
      width: 26,
      tone: ["#6f4d2c", "#c49a63"],
      sway: (d) =>
        (13 + 4 * (swell?.(d) ?? 0)) *
        Math.sin(wave(thick, d) + 0.9 * (drift?.(d) ?? 0)),
    },
    {
      id: "b",
      width: 20,
      tone: ["#5d3f24", "#b0844f"],
      sway: (d) =>
        -(12 + 4 * (ebb?.(d) ?? 0)) *
        Math.sin(
          wave(thick, d) + 0.9 * (drift?.(d) ?? 0) + 0.7 * (lag?.(d) ?? 0),
        ),
    },
    {
      id: "c",
      width: 11,
      tone: ["#7a5a36", "#d0aa74"],
      sway: (d) =>
        17 * Math.sin(wave(Math.round(length / 70), d) + 0.8 * (lag?.(d) ?? 0)),
    },
    {
      id: "d",
      width: 8,
      tone: ["#4f3620", "#a47c4b"],
      sway: (d) =>
        15 *
        Math.sin(wave(Math.round(length / 88), d) + 0.9 * (drift?.(d) ?? 0)),
    },
  ];
}

const steps = (length: number, count: number): readonly number[] =>
  Array.from({ length: count + 1 }, (_, i) => (length * i) / count);

/** Shorter branches that leave a rail to one side and come back, clear of its corners. */
function sideBranches(random: Random, rail: Rail): readonly Branch[] {
  return Array.from({ length: rail.length > 800 ? 3 : 2 }, (_, i) => {
    const length = random.between(0.14, 0.24) * rail.length;
    const from = random.between(
      0.08 * rail.length,
      0.92 * rail.length - length,
    );
    // No further than the frame layer of a tile on the grid's edge has room for.
    const reach = (i % 2 === 0 ? -1 : 1) * random.between(12, 18);
    const wobble = random.between(0, TAU);
    const points = steps(length, Math.ceil(length / STEP)).map((along) => {
      const t = along / length;
      const arch = Math.max(0, Math.sin(Math.PI * t));
      const off =
        reach * arch ** 0.7 + 4 * Math.sin(TAU * 2 * t + wobble) * arch;
      return onRail(rail, from + along, off);
    });
    return {
      id: `q${rail.id}${String(i)}`,
      width: random.between(12, 18),
      tone: i % 2 ? ["#6a4a2a", "#bf9660"] : ["#584027", "#a9804e"],
      d: curve(points, whole),
    };
  });
}

/** Round windows over every other place the two thick branches cross, between the corners. */
function overWindows(rail: Rail, first: Sway, second: Sway): string {
  const fine = steps(rail.length, 1200).slice(8, -8);
  const apart = (i: number): number => {
    const distance = fine[i] ?? 0;
    return first(distance) - second(distance);
  };
  return fine
    .slice(0, -1)
    .filter((_, i) => apart(i) < 0 !== apart(i + 1) < 0)
    .filter((_, k) => k % 2 === 0)
    .map((distance) => {
      const centre = onRail(rail, distance, first(distance));
      return `<circle cx="${whole(centre[0])}" cy="${whole(centre[1])}" r="27"/>`;
    })
    .join("");
}

interface DrawnRail {
  readonly defs: string;
  /** The rail and its twin. */
  readonly art: string;
}

function drawRail(random: Random, rail: Rail): DrawnRail {
  const woven = strands(random, rail);
  const count = Math.ceil(rail.length / STEP);
  const branches: readonly Branch[] = [
    ...sideBranches(random, rail),
    ...woven.map((s) => ({
      id: `r${rail.id}${s.id}`,
      width: s.width,
      tone: s.tone,
      d: curve(
        steps(rail.length, count).map((d) => onRail(rail, d, s.sway(d))),
        whole,
      ),
    })),
  ];
  const named = (id: string): Branch | undefined =>
    branches.find((b) => b.id === `r${rail.id}${id}`);
  const [first, second] = woven;
  const over =
    first && second ? overWindows(rail, first.sway, second.sway) : "";
  const shadows = branches
    .filter((b) => b.width > 11)
    .map((b) => stroke(b.id, `stroke-width="${num(b.width)}"`))
    .join("");
  const [top, withy] = [named("a"), named("c")];
  const group =
    `<g id="g${rail.id}"><g filter="url(#fs)" opacity=".6" transform="translate(${SHADOW.dx} ${SHADOW.dy})" stroke="#000">${shadows}</g>` +
    branches.map(bark).join("") +
    `<g clip-path="url(#o${rail.id})">${top ? bark(top) : ""}</g>${withy ? bark(withy) : ""}</g>`;
  return {
    defs: `${defined(branches)}<clipPath id="o${rail.id}">${over}</clipPath>`,
    art: `${group}<use href="#g${rail.id}" transform="translate(${at(rail.twin)})"/>`,
  };
}

/** Five turns of withy round a corner, where the cells' branches meet. */
function binding(random: Random, [x, y]: Point): string {
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

/** The lattice's cell, filling the frame layer of a tile in a grid. */
export function drawLattice(seed = 7): string {
  const random = createRandom(seed);
  const rails = RAILS.map((rail) => drawRail(random, rail));
  const knot = binding(random, CORNER);
  const corners: readonly Point[] = [
    [0, 0],
    [WIDE, 0],
    [0, TALL],
    [WIDE, TALL],
  ];
  return svgDocument(
    `<defs>${rails.map((r) => r.defs).join("")}${blurFilter("fs", SHADOW.blur)}</defs>` +
      `<g fill="none" stroke-linejoin="round" stroke-linecap="round">${rails.map((r) => r.art).join("")}` +
      `<g id="k">${knot}</g>${corners
        .slice(1)
        .map((c) => `<use href="#k" transform="translate(${at(c)})"/>`)
        .join("")}</g>`,
    GRID_VIEW,
  );
}
