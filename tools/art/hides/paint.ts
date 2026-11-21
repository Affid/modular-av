// The war paint round a camera's picture: a hand's daubs from each corner
// along both edges, heavy where the finger landed and running out before
// the middle. Drawn here as a mask; the render script turns it into
// pixels and the hide's scene keeps the painted hide only where it is
// (render/hide.py), so the paint has the hide's grain and the scene's
// light. The stylesheet gives it the player's colour.
import { createRandom, type Random } from "../vines/random.ts";
import { svgDocument } from "../vines/svg.ts";
import { daub } from "./daub.ts";
import { PAINT, TILE, VIEW } from "./geometry.ts";

type Point = readonly [number, number];

/** Paint is dry at its edges and streaked along the finger's way. */
const streaked = (id: string, frequency: string, seed: number): string =>
  `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${String(seed)}" result="rag"/><feDisplacementMap in="SourceGraphic" in2="rag" scale="5" result="ragged"/><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="2" seed="${String(seed + 5)}" result="streak"/><feColorMatrix in="streak" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -4.2 2.9" result="gaps"/><feComposite in="ragged" in2="gaps" operator="in"/></filter>`;

const FILTERS = `<defs>${streaked("across", "0.012 0.4", 3)}${streaked("down", "0.4 0.012", 4)}</defs>`;

interface Corner {
  readonly at: Point;
  /** Which way the picture's middle is from this corner. */
  readonly inward: Point;
}

const corners = (): readonly Corner[] => {
  const [left, top] = [PAINT.inset, PAINT.inset];
  const [right, bottom] = [TILE.width - PAINT.inset, TILE.height - PAINT.inset];
  return [
    { at: [left, top], inward: [1, 1] },
    { at: [right, top], inward: [-1, 1] },
    { at: [right, bottom], inward: [-1, -1] },
    { at: [left, bottom], inward: [1, -1] },
  ];
};

/** One corner's daubs: a long one each way, and a shorter pass beside each, where the finger went back for more. */
function cornerDaubs(
  random: Random,
  { at: [cx, cy], inward: [sx, sy] }: Corner,
): { readonly across: readonly string[]; readonly down: readonly string[] } {
  const wide = random.between(22, 28);
  const along = (TILE.width - 2 * PAINT.inset) * random.between(0.2, 0.32);
  const up = (TILE.height - 2 * PAINT.inset) * random.between(0.3, 0.46);
  const jitter = (by: number): number => random.between(-by, by);
  const across = [
    daub(
      random,
      [cx - sx * 9, cy + jitter(2)],
      [cx + sx * along, cy + jitter(2.5)],
      wide,
    ),
    daub(
      random,
      [cx + sx * along * 0.25, cy + sy * random.between(3, 6)],
      [
        cx + sx * along * random.between(0.7, 1.2),
        cy + sy * random.between(0, 3),
      ],
      wide * 0.6,
    ),
  ];
  const down = [
    daub(
      random,
      [cx + jitter(2), cy - sy * 9],
      [cx + jitter(2.5), cy + sy * up],
      wide,
    ),
    daub(
      random,
      [cx + sx * random.between(3, 6), cy + sy * up * 0.25],
      [cx + sx * random.between(0, 3), cy + sy * up * random.between(0.7, 1.2)],
      wide * 0.6,
    ),
  ];
  return { across, down };
}

/** The daubs on hide `hide` (0 or 1), white on nothing, over the whole frame layer. */
export function drawDaubs(hide: number): string {
  const seed = PAINT.seeds[hide];
  if (seed === undefined)
    throw new Error(`There is no hide ${String(hide)} to paint`);
  const random = createRandom(seed);
  const made = corners().map((corner) => cornerDaubs(random, corner));
  const across = made.flatMap((corner) => corner.across).join("");
  const down = made.flatMap((corner) => corner.down).join("");
  return svgDocument(
    `${FILTERS}<g fill="#fff"><g filter="url(#across)">${across}</g><g filter="url(#down)">${down}</g></g>`,
    VIEW,
  );
}
