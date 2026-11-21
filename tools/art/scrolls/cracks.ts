// A player who is out of the call: their stones are cracked. Dark cracks
// from near each stone's middle to its rim, drawn over the rendered
// stones and cut to their shape by the stylesheet.
import type { Point } from "../vines/geometry.ts";
import { createRandom, type Random } from "../vines/random.ts";
import { svgDocument } from "../vines/svg.ts";
import { type Stone, STONES, VIEW } from "./geometry.ts";

const n = (v: number): string => String(Math.round(v * 10) / 10);

const DARK = "#15101a";
/** Cracks to a stone, and the bends in each. */
const CRACKS = 3;
const BENDS = 4;
/** A crack runs a little past the rim: the stone's shape cuts it. */
const PAST_RIM = 1.08;

/** One crack from `from` outward at `angle`: a line that jumps sideways at each bend. */
function crack(
  random: Random,
  from: Point,
  stone: Stone,
  angle: number,
): readonly Point[] {
  const reach = stone.radius * PAST_RIM;
  const bends = Array.from({ length: BENDS }, (_, i): Point => {
    const along = ((i + 1) / BENDS) * reach;
    const aside =
      i === BENDS - 1 ? 0 : random.between(-0.16, 0.16) * stone.radius;
    return [
      stone.x + Math.cos(angle) * along - Math.sin(angle) * aside,
      stone.y + Math.sin(angle) * along + Math.cos(angle) * aside,
    ];
  });
  return [from, ...bends];
}

const path = (points: readonly Point[]): string =>
  `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}`;

function stoneCracks(stone: Stone, index: number, seed: number): string {
  const random = createRandom(seed);
  const from: Point = [
    stone.x + random.between(-0.2, 0.2) * stone.radius,
    stone.y + random.between(-0.2, 0.2) * stone.radius,
  ];
  const turn = random.between(0, Math.PI * 2);
  const lines = Array.from({ length: CRACKS }, (_, i) =>
    crack(
      random,
      from,
      stone,
      turn + (i * Math.PI * 2) / CRACKS + random.between(-0.35, 0.35),
    ),
  );
  // A short side crack off the middle of the first.
  const [first] = lines;
  const fork = first?.[2] ?? from;
  const side = turn + Math.PI / 2 + random.between(-0.3, 0.3);
  const branch: readonly Point[] = [
    fork,
    [
      fork[0] + Math.cos(side) * stone.radius * 0.45,
      fork[1] + Math.sin(side) * stone.radius * 0.45,
    ],
  ];
  const d = [...lines, branch].map(path).join("");
  return (
    `<path d="${d}" stroke="#fff" stroke-opacity=".4" stroke-width="2.4" transform="translate(2.2 2.6)"/>` +
    `<path id="crack-${index}" d="${d}" stroke="${DARK}" stroke-opacity=".92" stroke-width="5.5"/>`
  );
}

/** The cracks for the stones of one of the two scrolls. */
export function drawCracks(scroll: number): string {
  const stones = STONES[scroll % STONES.length] ?? [];
  const drawn = stones
    .map((stone, i) => stoneCracks(stone, i, 700 + scroll * 10 + i))
    .join("");
  return svgDocument(
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${drawn}</g>`,
    VIEW,
  );
}
