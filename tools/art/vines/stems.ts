// Stems: the thick ones that wind round the frame from two corners, and the
// thin shoots and tendrils that grow off them.
import {
  FACES,
  inBox,
  lerp,
  type Point,
  SIDES,
  THICKNESS,
} from "./geometry.ts";
import type { Random } from "./random.ts";

export interface Sample {
  readonly at: Point;
  /** How far along the stem. */
  readonly along: number;
  /** False where the stem passes behind the frame. */
  readonly shown: boolean;
  readonly width: number;
}
export type Stem = readonly Sample[];

const STEP = 5;

interface Climb {
  readonly from: Point;
  readonly along: Point;
  /** Away from the video. */
  readonly out: Point;
  readonly length: number;
  readonly thick: number;
  readonly thin: number;
  /** How far the free tip leans out. */
  readonly lean: number;
}

/** A stem winding round a side: in front of it, behind it, in front. */
function climb(random: Random, spec: Climb): Stem {
  // A little less than the bundle's own half-width: the stem stays on it.
  const reach = THICKNESS / 2 - 3;
  const start = random.between(0, 2 * Math.PI);
  const wobble = random.between(0, 6);
  return Array.from({ length: Math.floor(spec.length / STEP) + 1 }, (_, i) => {
    const along = i * STEP;
    const phase =
      start +
      (2 * Math.PI * along) / 250 +
      0.9 * Math.sin(along / 190 + wobble);
    const tip = Math.max(0, (along - (spec.length - 120)) / 120);
    const off =
      reach * Math.sin(phase) * (1 - tip * 0.7) + tip * tip * spec.lean;
    const shown =
      Math.cos(phase) > -0.05 ||
      Math.abs(off) > THICKNESS / 2 - 1 ||
      tip > 0.1 ||
      along < 45;
    return {
      at: [
        spec.from[0] + spec.along[0] * along + spec.out[0] * off,
        spec.from[1] + spec.along[1] * along + spec.out[1] * off,
      ],
      along,
      shown,
      width: lerp(spec.thick, spec.thin, along / spec.length),
    };
  });
}

interface Shoot {
  readonly from: Point;
  readonly angle: number;
  readonly length: number;
  /** Radians it turns per unit of length. */
  readonly bend: number;
  /** How hard its last two fifths curl up. */
  readonly curl: number;
  readonly width: number;
}

/** A free shoot: it sets off at an angle and bends as it goes. */
function shoot(spec: Shoot): Stem {
  const heading = (along: number): number => {
    const past = Math.max(0, along / spec.length - 0.6);
    return (
      spec.angle +
      spec.bend * along +
      (spec.curl * past * past * spec.length) / 2
    );
  };
  return Array.from({ length: Math.floor(spec.length / STEP) + 1 }).reduce<
    Sample[]
  >((stem, _, i) => {
    const along = i * STEP;
    const last = stem.at(-1);
    const at: Point = last
      ? [
          last.at[0] + Math.cos(heading(along)) * STEP,
          last.at[1] + Math.sin(heading(along)) * STEP,
        ]
      : spec.from;
    const width = lerp(spec.width, 1.6, along / spec.length);
    return [...stem, { at, along, shown: true, width }];
  }, []);
}

/** The direction a stem runs at sample `i`. */
export function tangent(stem: Stem, i: number): number {
  const before = stem[Math.max(0, i - 1)]?.at ?? [0, 0];
  const after = stem[Math.min(stem.length - 1, i + 1)]?.at ?? before;
  return Math.atan2(after[1] - before[1], after[0] - before[0]);
}

/** The corners the stems start from, for vines grown from the top left. */
export const NEAR: Point = [SIDES.left, SIDES.top];
export const FAR: Point = [SIDES.right, SIDES.bottom];

/** Two long stems from the top left corner, two shorter from the bottom right. */
export function mainStems(random: Random): readonly Stem[] {
  const stem = (
    from: Point,
    along: Point,
    out: Point,
    lengths: readonly [number, number],
    widths: readonly [number, number],
  ): Stem =>
    climb(random, {
      from,
      along,
      out,
      length: random.between(...lengths),
      thick: widths[0],
      thin: widths[1],
      lean: 48,
    });
  return [
    stem(NEAR, [1, 0], [0, -1], [640, 840], [16, 6]),
    stem(NEAR, [0, 1], [-1, 0], [330, 480], [15, 6]),
    stem(FAR, [-1, 0], [0, 1], [260, 420], [13, 5]),
    stem(FAR, [0, -1], [1, 0], [190, 320], [12, 5]),
  ];
}

/** The sample a fraction `t` of the way along a stem. */
const sampleAt = (stem: Stem, t: number): Sample | undefined =>
  stem[Math.round(t * (stem.length - 1))];

/** Where a point grown round the straight frame ends up, and whether that is in its picture. */
export interface Place {
  readonly point: (p: Point) => Point;
  /** Inside the picture, at least `pad` from its edges. */
  readonly shows: (p: Point, pad: number) => boolean;
}

/** Whether a sample ends up in the picture and off the faces. */
const clear = (sample: Sample, place: Place): boolean => {
  const at = place.point(sample.at);
  return place.shows(at, 6) && !inBox(FACES, at);
};

/** Shoots that hang a little way into the picture; one that would cover a face isn't grown. */
export function hangingShoots(
  random: Random,
  stems: readonly Stem[],
  place: Place,
): readonly Stem[] {
  const hang = (
    stem: Stem | undefined,
    where: readonly [number, number],
    angles: readonly [number, number],
    lengths: readonly [number, number],
    bend: number,
  ): readonly Stem[] => {
    const from = sampleAt(stem ?? [], random.between(...where))?.at;
    const grown = shoot({
      from: from ?? [0, 0],
      angle: random.between(...angles),
      length: random.between(...lengths),
      bend,
      curl: 0,
      width: 4.5,
    });
    return from && grown.every((sample) => clear(sample, place)) ? [grown] : [];
  };
  return [
    ...hang(stems[0], [0.25, 0.4], [1.2, 1.9], [58, 74], 0.004),
    ...hang(stems[0], [0.55, 0.75], [1.3, 1.8], [40, 60], -0.004),
    ...hang(stems[1], [0.4, 0.7], [-0.2, 0.5], [60, 80], 0.01),
    ...hang(stems[2], [0.3, 0.6], [-1.9, -1.4], [40, 58], 0.004),
  ];
}

/** Tendrils that curl up tight, cut short where they would leave the picture. */
export function tendrils(
  random: Random,
  stems: readonly Stem[],
  place: Place,
): readonly Stem[] {
  const spots = [
    [0, 0.5, -Math.PI / 2],
    [0, 0.92, -Math.PI / 2],
    [1, 0.9, Math.PI],
    [2, 0.9, Math.PI / 2],
    [3, 0.85, 0],
  ] as const;
  return spots.flatMap(([stem, t, out]) => {
    const from = sampleAt(stems[stem] ?? [], t)?.at;
    const way = (): number => (random.next() < 0.5 ? 1 : -1);
    const grown = shoot({
      from: from ?? [0, 0],
      angle: out + random.between(-0.7, 0.7),
      length: random.between(55, 80),
      bend: random.between(0.012, 0.03) * way(),
      curl: 0.22 * way(),
      width: 2.6,
    });
    const end = grown.findIndex((sample) => !clear(sample, place));
    const kept = end < 0 ? grown : grown.slice(0, end);
    return from && kept.length > 6 ? [kept] : [];
  });
}
