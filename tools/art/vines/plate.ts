// What the theme lays under a tile's name and level: a strip of bark with
// broken ends that the name hangs on, the loops of withy it hangs by, and
// a creeping shoot that the level meter shows through.
import { num, whole } from "./geometry.ts";
import { PLATE } from "./plant.ts";
import { createRandom, type Random } from "./random.ts";

const WIDE = 300;
const TALL = 80;
const OUTLINE = "#120b05";

/** A nearly level edge at `y`, as points from `from` to `to`. */
const edge = (
  random: Random,
  y: number,
  from: number,
  to: number,
): readonly string[] =>
  Array.from(
    { length: 9 },
    (_, i) =>
      `${whole(from + ((to - from) * i) / 8)} ${num(y + random.between(-2.2, 2.2))}`,
  );

/** A broken end about `x`, as points from `from` down or up to `to`. */
const brokenEnd = (
  random: Random,
  x: number,
  from: number,
  to: number,
): readonly string[] =>
  Array.from(
    { length: 5 },
    (_, i) =>
      `${num(x + random.between(-5, 5))} ${whole(from + ((to - from) * (i + 0.5)) / 5)}`,
  );

/** A strip of bark for a name: its ends keep their shape, its middle stretches. */
export function drawPlate(seed: number): string {
  const random = createRandom(seed);
  const shape = `M${[
    ...edge(random, 6, 10, WIDE - 10),
    ...brokenEnd(random, WIDE - 7, 8, TALL - 6),
    ...edge(random, TALL - 5, WIDE - 10, 10),
    ...brokenEnd(random, 7, TALL - 6, 8),
  ].join("L")}Z`;
  const grain = Array.from({ length: 6 }, (_, i) => {
    const y = 14 + i * 11 + random.between(-2, 2);
    const from = random.between(8, 60);
    const to = random.between(WIDE - 60, WIDE - 8);
    return `M${whole(from)} ${num(y)}Q${whole(WIDE / 2)} ${num(y + random.between(-3, 3))} ${whole(to)} ${num(y + random.between(-2, 2))}`;
  });
  const lines = (odd: number): string =>
    grain.filter((_, i) => i % 2 === odd).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PLATE.width}" height="${PLATE.height}" viewBox="0 0 ${WIDE} ${TALL}" preserveAspectRatio="none"><defs>` +
    `<linearGradient id="bk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3521"/><stop offset=".5" stop-color="#35261a"/><stop offset="1" stop-color="#241910"/></linearGradient>` +
    `<clipPath id="in"><path d="${shape}"/></clipPath></defs>` +
    `<path d="${shape}" fill="url(#bk)" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>` +
    `<g clip-path="url(#in)" fill="none" stroke-linecap="round">` +
    `<path d="${lines(0)}" stroke="${OUTLINE}" stroke-opacity=".55" stroke-width="1.6"/>` +
    `<path d="${lines(1)}" stroke="#b0844f" stroke-opacity=".22" stroke-width="1.4"/>` +
    `<path d="M12 10Q150 7 288 10" stroke="#d0aa74" stroke-opacity=".35" stroke-width="2.4"/></g></svg>\n`
  );
}

/** A loop of withy over the branch a plate hangs from: two turns, their ends on the plate. */
export function drawLoop(seed: number): string {
  const random = createRandom(seed);
  const turns = [0, 7].map((o, i) => {
    const [from, to] = [
      9 + o + random.between(-1, 1),
      27 + o + random.between(-1, 1),
    ];
    const d = `M${num(from)} 98C${6 + o} 60 ${4 + o} 26 ${14 + o} 8C${22 + o} -2 ${30 + o} 6 ${29 + o} 30C${28 + o} 56 ${31 + o} 78 ${num(to)} 98`;
    return (
      `<path d="${d}" stroke="${OUTLINE}" stroke-width="9"/><path d="${d}" stroke="${i % 2 ? "#9a7a48" : "#86683c"}" stroke-width="6"/>` +
      `<path d="${d}" transform="translate(-1.2 -.6)" stroke="#e2c690" stroke-opacity=".55" stroke-width="1.6"/>`
    );
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 100" preserveAspectRatio="none"><g fill="none" stroke-linecap="round">${turns.join("")}</g></svg>\n`;
}

/** A leaf for the meter's shoot: a pointed oval from its stalk, turned and scaled. */
const meterLeaf = (x: number, y: number, turn: number, scale: number): string =>
  `<path d="M0 0C5 -8 17 -8 24 0C17 6 5 6 0 0Z" transform="translate(${x} ${y}) rotate(${turn}) scale(${scale})"/>`;

/**
 * A creeping shoot with small leaves, in white: a mask the level meter
 * shows through. It repeats along the meter.
 */
export function drawMeterVine(): string {
  const leaves = [
    meterLeaf(18, 9.5, -48, 0.62),
    meterLeaf(40, 13, 52, 0.5),
    meterLeaf(66, 16.5, -36, 0.66),
    meterLeaf(93, 12.5, 58, 0.52),
    meterLeaf(104, 10.5, -52, 0.44),
  ];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 24" preserveAspectRatio="none">` +
    `<path d="M-2 13C14 7 30 8 44 13S76 19 92 13S112 9 122 13" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>` +
    `<g fill="#fff">${leaves.join("")}</g></svg>\n`
  );
}
