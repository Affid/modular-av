// A frame that looks grown, not built: branches twisted into one loop round
// the camera along the frame's own outline. No two branches are alike, the
// weave tightens and loosens, and shorter branches leave the bundle and
// come back, so the edge of the picture is whatever edge they make.
import {
  at,
  blurFilter,
  curve,
  num,
  type Point,
  TILE,
  VIEW,
  whole,
} from "./geometry.ts";
import { loopSpot, PERIMETER } from "./loop.ts";
import { coverDepth, type Outline, SHADOW } from "./outline.ts";
import { createRandom, type Random } from "./random.ts";
import { svgDocument } from "./svg.ts";

const STEP = 26;
const TAU = 2 * Math.PI;
export const DARK = "#1b1108";
/** Ripples of the outline the light keeps clear of, and how far its blur spreads. */
const RIPPLE = 10;
const LIGHT_BLUR = 9;

export type Tone = readonly [body: string, light: string];
/** How far out from the bundle's centre line, at a distance round the loop. */
export type Sway = (distance: number) => number;

export interface Branch {
  readonly id: string;
  readonly width: number;
  readonly tone: Tone;
  /** Its path. */
  readonly d: string;
}

export interface FrameArt {
  /** The branches, filling the frame layer. */
  readonly frame: string;
  /** The picture's shape inside them, filling the tile: the video's mask and its ground. */
  readonly shape: string;
  /** A soft light on the picture's rim, for a mask: it stops at the branches. */
  readonly light: string;
}

const steps = (count: number): readonly number[] =>
  Array.from({ length: count }, (_, i) => (PERIMETER * i) / count);
const ROUND = steps(Math.ceil(PERIMETER / STEP));

/** A branch that runs the whole way round: three steps over, so it closes smoothly. */
const around = (outline: Outline, sway: Sway): string =>
  curve(
    [...ROUND, ...ROUND.slice(0, 3)].map((distance) =>
      outline.point(distance, sway(distance)),
    ),
    whole,
  );

/** A slow wave round the loop, from -1 to 1, that closes on itself. */
function slow(random: Random, turns: number): Sway {
  const phase = random.between(0, TAU);
  return (distance) => Math.sin((TAU * turns * distance) / PERIMETER + phase);
}

interface Strand {
  readonly id: string;
  readonly width: number;
  readonly tone: Tone;
  readonly sway: Sway;
}

/** Two thick branches twisted round each other, and two thin ones through them. */
function strands(random: Random): readonly Strand[] {
  const [drift, flutter, lag, swell, ebb] = [2, 5, 3, 4, 6].map((turns) =>
    slow(random, turns),
  );
  const wave = (turns: number, d: number): number =>
    (TAU * turns * d) / PERIMETER;
  // The weave speeds up and slows down on its way round.
  const weave: Sway = (d) =>
    wave(13, d) + 0.9 * (drift?.(d) ?? 0) + 0.5 * (flutter?.(d) ?? 0);
  return [
    {
      id: "wa",
      width: 26,
      tone: ["#6f4d2c", "#c49a63"],
      sway: (d) => (13 + 4 * (swell?.(d) ?? 0)) * Math.sin(weave(d)),
    },
    {
      id: "wb",
      width: 20,
      tone: ["#5d3f24", "#b0844f"],
      sway: (d) =>
        (12 + 4 * (ebb?.(d) ?? 0)) *
        Math.sin(weave(d) + Math.PI + 0.8 * (lag?.(d) ?? 0)),
    },
    {
      id: "wc",
      width: 11,
      tone: ["#7a5a36", "#d0aa74"],
      sway: (d) => 17 * Math.sin(wave(21, d) + 1.3 + 0.8 * (flutter?.(d) ?? 0)),
    },
    {
      id: "wd",
      width: 8,
      tone: ["#4f3620", "#a47c4b"],
      sway: (d) => 15 * Math.sin(wave(17, d) + 4 + 0.9 * (drift?.(d) ?? 0)),
    },
  ];
}

/** Round windows over every other place the two thick branches cross: there the first goes over. */
function overWindows(outline: Outline, first: Sway, second: Sway): string {
  const fine = steps(2400);
  const apart = (i: number): number => {
    const distance = fine[i % fine.length] ?? 0;
    return first(distance) - second(distance);
  };
  // A change of sign, counted once: a touch without crossing isn't one.
  const crossings = fine.filter((_, i) => apart(i) < 0 !== apart(i + 1) < 0);
  return crossings
    .filter((_, k) => k % 2 === 0)
    .map((distance, k, own) => {
      const next = own[k + 1] ?? (own[0] ?? 0) + PERIMETER;
      const radius = Math.min(52, Math.max(24, (next - distance) * 0.22));
      const centre = outline.point(distance, first(distance));
      return `<circle cx="${whole(centre[0])}" cy="${whole(centre[1])}" r="${whole(radius)}"/>`;
    })
    .join("");
}

const SIDE_TONES: readonly Tone[] = [
  ["#584027", "#a9804e"],
  ["#6a4a2a", "#bf9660"],
  ["#6a4a2a", "#bf9660"],
];

/** Shorter branches that leave the bundle to one side and come back: thicker here, thinner there. */
function sideBranches(random: Random, outline: Outline): readonly Branch[] {
  return Array.from({ length: 7 }, (_, i) => {
    const from = random.between(0, PERIMETER);
    const length = random.between(0.07, 0.18) * PERIMETER;
    // Alternately into the picture, a little, and out of it, further.
    const reach =
      i % 2 === 0 ? -random.between(10, 17) : random.between(18, 32);
    const wobble = random.between(0, TAU);
    const width = random.between(12, 18);
    const count = Math.ceil(length / STEP);
    const points = Array.from({ length: count + 1 }, (_, k): Point => {
      const t = k / count;
      const arch = Math.sin(Math.PI * t);
      const off =
        reach * arch ** 0.7 + 4 * Math.sin(TAU * 2 * t + wobble) * arch;
      return outline.point(from + length * t, off);
    });
    const tone = SIDE_TONES[i % SIDE_TONES.length] ?? ["#6a4a2a", "#bf9660"];
    return { id: `p${String(i)}`, width, tone, d: curve(points, whole) };
  });
}

/** Short twigs off the outside of the bundle, cut off pale. */
function twigs(random: Random, outline: Outline): string {
  return Array.from({ length: 10 }, () => {
    const distance = random.between(0, PERIMETER);
    const { out } = loopSpot(distance);
    const lean = random.between(-0.9, 0.9);
    const way: Point = [
      out[0] * Math.cos(lean) - out[1] * Math.sin(lean),
      out[0] * Math.sin(lean) + out[1] * Math.cos(lean),
    ];
    const from = outline.point(distance, 6);
    const length = random.between(34, 62);
    const bow = random.between(-10, 10);
    const middle: Point = [
      from[0] + (way[0] * length) / 2 - way[1] * bow,
      from[1] + (way[1] * length) / 2 + way[0] * bow,
    ];
    const tip: Point = [from[0] + way[0] * length, from[1] + way[1] * length];
    const d = `M${at(from)}Q${at(middle)} ${at(tip)}`;
    return (
      `<path d="${d}" stroke="${DARK}" stroke-width="10.5"/><path d="${d}" stroke="#6f4d2c" stroke-width="7"/>` +
      `<path d="${d}" transform="translate(-1 -1.6)" stroke="#c49a63" stroke-opacity=".7" stroke-width="2"/>` +
      `<circle cx="${num(tip[0])}" cy="${num(tip[1])}" r="3.6" fill="#d9bb86" stroke="${DARK}" stroke-width="1.3"/>`
    );
  }).join("");
}

export const stroke = (id: string, attributes: string): string =>
  `<use href="#${id}" ${attributes}/>`;

/** A branch painted round: outline, body, shade, light, grain. */
export function bark({ id, width, tone }: Branch): string {
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

export const defined = (branches: readonly Branch[]): string =>
  branches.map((b) => `<path id="${b.id}" d="${b.d}"/>`).join("");

/** The bundle's centre line, closed: inside it is the picture. */
const centreLine = (outline: Outline): string =>
  `M${ROUND.map((distance) => at(outline.point(distance, 0), whole)).join("L")}Z`;

function frameSvg(
  branches: readonly Branch[],
  over: string,
  twigArt: string,
): string {
  const named = (id: string): Branch | undefined =>
    branches.find((b) => b.id === id);
  const [first, withy] = [named("wa"), named("wc")];
  const shadows = branches
    .filter((b) => b.width > 11)
    .map((b) => stroke(b.id, `stroke-width="${num(b.width)}"`))
    .join("");
  return svgDocument(
    `<defs>${defined(branches)}<clipPath id="wo">${over}</clipPath>${blurFilter("fs", SHADOW.blur)}</defs>` +
      `<g fill="none" stroke-linejoin="round" stroke-linecap="round">` +
      `<g filter="url(#fs)" opacity=".6" transform="translate(${SHADOW.dx} ${SHADOW.dy})" stroke="#000">${shadows}</g>` +
      twigArt +
      branches.map(bark).join("") +
      // Over again where it crosses on top, and the withy over that.
      `<g clip-path="url(#wo)">${first ? bark(first) : ""}</g>${withy ? bark(withy) : ""}</g>`,
  );
}

/** The ground behind a picture: the theme's `--mav-dock-tile-bg`. */
const GROUND = "#17110b";

/**
 * The picture's shape, in the tile's own box: a mask for the video, and,
 * in the ground's colour, what is behind it.
 */
const shapeSvg = (outline: Outline): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${TILE.left} ${TILE.top} ${TILE.right - TILE.left} ${TILE.bottom - TILE.top}" preserveAspectRatio="none"><path d="${centreLine(outline)}" fill="${GROUND}"/></svg>\n`;

/**
 * A band of light just inside the bundle's centre line, blurred, with the
 * branches cut out of it: it has no line of its own. It is narrower where
 * the bundle hangs deep, so that it too stays in the picture's margin.
 */
function lightSvg(outline: Outline, branches: readonly Branch[]): string {
  const inner = ROUND.map((distance) => {
    const left = coverDepth(distance) - outline.depth(distance) - RIPPLE;
    // The blur spreads about twice its deviation; two and a half leaves spare.
    const wide = Math.min(24, Math.max(0, left - 12 - 2.5 * LIGHT_BLUR));
    return at(outline.point(distance, -12 - wide), whole);
  });
  const cut = branches
    .map((b) => stroke(b.id, `stroke-width="${num(b.width + 5)}"`))
    .join("");
  return svgDocument(
    `<defs>${defined(branches)}${blurFilter("lb", LIGHT_BLUR)}` +
      `<mask id="lm" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.width}" height="${VIEW.height}"><path d="${centreLine(outline)}" fill="#fff"/><g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">${cut}</g></mask></defs>` +
      `<g mask="url(#lm)"><path d="${centreLine(outline)}M${inner.join("L")}Z" fill-rule="evenodd" filter="url(#lb)" opacity=".55"/></g>`,
  );
}

/** A frame's three pictures, the same every time for the same outline and seed. */
export function drawFrame(outline: Outline, seed: number): FrameArt {
  const random = createRandom(seed);
  const woven = strands(random);
  const [first, second] = woven;
  const branches: readonly Branch[] = [
    ...sideBranches(random, outline),
    ...woven.map((s) => ({
      id: s.id,
      width: s.width,
      tone: s.tone,
      d: around(outline, s.sway),
    })),
  ];
  const over =
    first && second ? overWindows(outline, first.sway, second.sway) : "";
  return {
    frame: frameSvg(branches, over, twigs(random, outline)),
    shape: shapeSvg(outline),
    light: lightSvg(outline, branches),
  };
}
