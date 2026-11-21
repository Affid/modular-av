// What is drawn on a camera's scroll, flat by nature: the ruled ink lines
// and the line of gold leaf round the picture, and a row of signs under
// it. The signs alone are also a mask (the level meter fills it, and a
// voice lights it), and blurred they are the glow of that light.
import { blurFilter, type Box } from "../vines/geometry.ts";
import { createRandom, type Random } from "../vines/random.ts";
import { svgDocument } from "../vines/svg.ts";
import { HALO, LINE, TILE, VIEW } from "./geometry.ts";
import { sigilRow } from "./sigils.ts";

const n = (v: number): string => String(Math.round(v * 10) / 10);

const INK = "#231d47";
const GOLD = "#b8902f";
const GOLD_LIGHT = "#f6e19a";

/** Each hand's seed for its ruled lines, and for its signs. */
const HANDS = [
  { lines: 11, signs: 90 },
  { lines: 23, signs: 91 },
  { lines: 37, signs: 92 },
  { lines: 53, signs: 93 },
] as const;

export const WRITINGS = HANDS.length;

/** How unsteady a ruled line is, in tile units: at its ends, and in its bow. */
const WOBBLE = { end: 1.4, bow: 1.5 };

/**
 * The picture's four edges ruled by hand, `grow` outside them (inside,
 * when negative), each line running `over` past its corners.
 */
function ruled(random: Random, grow: number, over = 0): string {
  const jitter = (v: number): number =>
    v + random.between(-WOBBLE.end, WOBBLE.end);
  const bow = (): number => random.between(-WOBBLE.bow, WOBBLE.bow);
  const edge: Box = {
    left: -grow,
    top: -grow,
    right: TILE.width + grow,
    bottom: TILE.height + grow,
  };
  const lines = [
    [edge.left - over, edge.top, edge.right + over, edge.top],
    [edge.left - over, edge.bottom, edge.right + over, edge.bottom],
    [edge.left, edge.top - over, edge.left, edge.bottom + over],
    [edge.right, edge.top - over, edge.right, edge.bottom + over],
  ] as const;
  return lines
    .map(
      ([ax, ay, bx, by]) =>
        `M${n(jitter(ax))} ${n(jitter(ay))}Q${n((ax + bx) / 2 + bow())} ${n((ay + by) / 2 + bow())} ${n(jitter(bx))} ${n(jitter(by))}`,
    )
    .join("");
}

export interface Writing {
  /** Gold leaf, ruled lines and signs, as painted: the frame layer's size. */
  readonly ink: string;
  /** The signs alone, white: a mask the size of their row. */
  readonly signs: string;
  /** The signs' glow, white: a mask a little larger than the row. */
  readonly halo: string;
}

/** One of the four hands a scroll is written in. */
export function drawWriting(hand: number): Writing {
  const seeds = HANDS[hand % HANDS.length] ?? HANDS[0];
  const random = createRandom(seeds.lines);
  const signs = sigilRow(createRandom(seeds.signs), LINE);
  // A thin line of leaf just inside the picture's edge, catching light in places.
  const gold =
    `<path id="gold" d="${ruled(random, -2)}" fill="none" stroke="${GOLD}" stroke-width="7.5" stroke-linecap="square"/>` +
    `<path id="gold-light" d="${ruled(random, -0.6)}" fill="none" stroke="${GOLD_LIGHT}" stroke-opacity=".9" stroke-width="2.2" stroke-dasharray="90 30 240 60 30 44 300 80"/>`;
  // Two ink lines: one outside the picture that crosses at the corners, one inside the leaf.
  const rules = `<path id="rule" d="${ruled(random, 7, 5)}${ruled(random, -9)}" fill="none" stroke="${INK}" stroke-opacity=".9" stroke-width="2.8" stroke-linecap="round"/>`;
  // Ink that has sunk into the vellum: a faint spread round each stroke, then the stroke.
  const written =
    `<defs><g id="signs">${signs}</g></defs>` +
    `<g fill="${INK}" stroke="${INK}" stroke-linejoin="round">` +
    `<use href="#signs" stroke-width="5" opacity=".16"/>` +
    `<use href="#signs" stroke-width=".8" opacity=".93"/></g>`;
  const blur = blurFilter("b", 9, HALO);
  return {
    ink: svgDocument(gold + rules + written, VIEW),
    signs: svgDocument(`<g fill="#fff">${signs}</g>`, LINE),
    halo: svgDocument(
      `<defs>${blur}</defs><g fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round" filter="url(#b)">${signs}</g>`,
      HALO,
    ),
  };
}
