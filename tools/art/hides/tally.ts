// The tally marks under a player's own name: their level. The picture is
// a mask the stylesheet lays over the level meter, so the marks light from
// the left as the voice rises, and stay dark where it doesn't reach.
import { createRandom, type Random } from "../vines/random.ts";
import { svgDocument } from "../vines/svg.ts";
import { heightOf, widthOf } from "../scrolls/geometry.ts";
import { daub } from "./daub.ts";
import { TALLY } from "./geometry.ts";

/** Fives: four strokes and one across them. */
export const GROUPS = 5;
export const STROKES = 4;

const SEED = 17;
const STROKE_WIDTH = 8.5;
const CROSS_WIDTH = 8;
/** How far the stroke across reaches past the four, each side. */
const CROSS_PAST = 12.5;

/** Dry paint: its edge is ragged. */
const DRY = `<defs><filter id="dry" x="-5%" y="-20%" width="110%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="4" result="rag"/><feDisplacementMap in="SourceGraphic" in2="rag" scale="3.5"/></filter></defs>`;

function group(random: Random, index: number): readonly string[] {
  const pitch = widthOf(TALLY) / GROUPS;
  const height = heightOf(TALLY);
  const left = TALLY.left + index * pitch + pitch * 0.14;
  const step = (pitch * 0.5) / (STROKES - 1);
  const strokes = Array.from({ length: STROKES }, (_, s) => {
    const x = left + s * step + random.between(-1.5, 1.5);
    const lean = random.between(-2.5, 2.5);
    return daub(
      random,
      [x + lean, TALLY.top + random.between(2, 6)],
      [x - lean, TALLY.bottom - random.between(2, 6)],
      STROKE_WIDTH,
    );
  });
  const across = daub(
    random,
    [left - CROSS_PAST, TALLY.top + height * random.between(0.72, 0.82)],
    [
      left + step * (STROKES - 1) + CROSS_PAST,
      TALLY.top + height * random.between(0.22, 0.32),
    ],
    CROSS_WIDTH,
  );
  return [...strokes, across];
}

/** The row of marks, white on nothing: a mask as large as the row. */
export function drawTally(): string {
  const random = createRandom(SEED);
  const marks = Array.from({ length: GROUPS }, (_, g) => group(random, g));
  return svgDocument(
    `${DRY}<g fill="#fff" filter="url(#dry)">${marks.flat().join("")}</g>`,
    TALLY,
  );
}
