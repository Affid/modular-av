// Leaf shapes. A leaf is drawn in a 100-unit box, its stalk at the origin
// and its tip along +x; `<use fill>` gives it its colour, and the shapes
// over it (black and white, partly clear) give it form.
import { num } from "./geometry.ts";

export type LeafShape = "ivy5" | "ivy3" | "heart" | "young";
export const LEAF_SHAPES = ["ivy5", "ivy3", "heart", "young"] as const;

/** Half an outline, from the stalk to the tip, above the midrib (y < 0). */
const HALVES: Record<LeafShape, string> = {
  // Ivy, five lobes.
  ivy5: "C2 -6 -10 -14 -6 -30C-3 -40 8 -42 20 -36C22 -46 30 -58 44 -60C52 -60 54 -48 56 -38C62 -34 84 -16 100 0",
  // Ivy, three lobes.
  ivy3: "C0 -10 -6 -24 4 -36C14 -46 26 -40 36 -34C46 -36 56 -32 62 -24C76 -18 90 -8 100 0",
  // A heart with a drawn-out tip.
  heart: "C-2 -8 -12 -20 -4 -34C6 -48 30 -46 48 -34C68 -22 86 -8 100 0",
  // A young leaf.
  young: "C6 -10 18 -24 40 -24C64 -22 86 -8 100 0",
};

/** Side veins, from the stalk or the midrib out to each lobe. */
const VEINS: Record<LeafShape, readonly string[]> = {
  ivy5: ["M4 0Q2 -16 -1 -30", "M5 0Q24 -28 43 -54", "M44 -1Q56 -10 66 -22"],
  ivy3: ["M4 0Q6 -18 9 -31", "M6 0Q28 -14 48 -30", "M48 -1Q60 -8 72 -16"],
  heart: ["M8 0Q6 -18 6 -30", "M20 0Q30 -20 40 -32", "M42 0Q54 -10 64 -18"],
  young: ["M20 0Q30 -10 40 -18", "M46 0Q56 -8 66 -12"],
};

/** The lower half is a little narrower: no leaf is quite symmetrical. */
const LOWER = 0.94;
const PAIR = /(-?[\d.]+) (-?[\d.]+)/g;

/** The same shape below the midrib. */
const below = (d: string): string =>
  d.replace(
    PAIR,
    (_, x: string, y: string) => `${x} ${num(-Number(y) * LOWER)}`,
  );

/** The lower half of an outline, run from the tip back to the stalk. */
function lowerHalf(half: string): string {
  const points = [
    [0, 0] as const,
    ...[...below(half).matchAll(PAIR)].map(
      (m) => [Number(m[1]), Number(m[2])] as const,
    ),
  ].toReversed();
  const at = (i: number): string =>
    `${points[i]?.[0] ?? 0} ${points[i]?.[1] ?? 0}`;
  return Array.from(
    { length: (points.length - 1) / 3 },
    (_, k) => `C${at(3 * k + 1)} ${at(3 * k + 2)} ${at(3 * k + 3)}`,
  ).join("");
}

/** A leaf's whole outline, from the stalk round to the stalk. */
export const leafOutline = (shape: LeafShape): string =>
  `M0 0${HALVES[shape]}${lowerHalf(HALVES[shape])}Z`;

/** Shading every leaf shares: dark at the stalk, light at the tip, a sheen. */
const SHADING =
  `<linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff7c0" stop-opacity=".3"/></linearGradient>` +
  `<radialGradient id="ls" gradientUnits="userSpaceOnUse" cx="50" cy="-18" r="34"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

function leafDef(shape: LeafShape): string {
  const d = leafOutline(shape);
  const veins = VEINS[shape].map((v) => v + below(v)).join("");
  return (
    `<path id="${shape}-s" d="${d}"/>` +
    `<g id="${shape}"><path d="${d}"/><path d="${d}" fill="url(#lg)"/>` +
    `<path d="M100 0${lowerHalf(HALVES[shape])}Z" fill="#000" fill-opacity=".2"/>` +
    `<path d="${d}" fill="url(#ls)"/>` +
    `<path d="${veins}" fill="none" stroke="#f3ffd0" stroke-opacity=".42" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M2 0Q50 -3 96 0" fill="none" stroke="#f3ffd0" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="#06200a" stroke-opacity=".6" stroke-width="2"/></g>`
  );
}

/** For `<defs>`: `#<shape>` the painted leaf, `#<shape>-s` its shadow. */
export const leafDefs = (): string =>
  SHADING + LEAF_SHAPES.map(leafDef).join("");
