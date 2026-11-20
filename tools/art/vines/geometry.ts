// The frame layer's measures, in the units the art is drawn in: a tile is
// 1000 wide.

export type Point = readonly [number, number];

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * How far the art reaches past the video on every side, as a fraction of the
 * tile's width: what the theme registers as `frames.reach`.
 */
export const REACH = 0.11;

const TILE_WIDTH = 1000;
const TILE_HEIGHT = (TILE_WIDTH * 9) / 16;
const MARGIN = TILE_WIDTH * REACH;

/** The video inside the frame layer. */
export const TILE: Box = {
  left: MARGIN,
  top: MARGIN,
  right: MARGIN + TILE_WIDTH,
  bottom: MARGIN + TILE_HEIGHT,
};

/** The frame layer: the SVG's view box. */
export const VIEW = {
  width: TILE_WIDTH + 2 * MARGIN,
  height: TILE_HEIGHT + 2 * MARGIN,
} as const;

/**
 * A blur over the whole picture (the frame layer, or `box`): a filter
 * sized to what it blurs would cut the blur off at a thin shape's edges.
 */
export function blurFilter(id: string, deviation: number, box?: Box): string {
  const [x, y] = [box?.left ?? 0, box?.top ?? 0];
  const width = box ? box.right - box.left : VIEW.width;
  const height = box ? box.bottom - box.top : VIEW.height;
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}"><feGaussianBlur stdDeviation="${deviation}"/></filter>`;
}

/** How thick a side of the frame is, and how much of it lies over the video. */
export const THICKNESS = 58;
const OVERLAP = 12;

/** The centre line of each side of the frame. */
export const SIDES = {
  top: TILE.top + OVERLAP - THICKNESS / 2,
  bottom: TILE.bottom - OVERLAP + THICKNESS / 2,
  left: TILE.left + OVERLAP - THICKNESS / 2,
  right: TILE.right - OVERLAP + THICKNESS / 2,
} as const;

/**
 * How much of each side of the video the dock lets a frame cover (its
 * MAX_FRAME_COVER): the rest, the middle, is the faces'.
 */
export const COVER = 0.15;

/**
 * Faces: no leaf or stem is drawn inside this box, the picture's middle and
 * enough spare for the shadows they cast.
 */
const SPARE = 14;
export const FACES: Box = {
  left: TILE.left + COVER * TILE_WIDTH - SPARE,
  top: TILE.top + COVER * TILE_HEIGHT - SPARE,
  right: TILE.right - COVER * TILE_WIDTH + SPARE,
  bottom: TILE.bottom - COVER * TILE_HEIGHT + SPARE,
};

/**
 * The room the dock keeps round a scattered tile, what the theme registers
 * as `frames.room`: the art's reach, and more under the tile, where its
 * name hangs on a plate.
 */
export const ROOM = { top: REACH, right: REACH, bottom: 0.19, left: REACH };

/**
 * The room round a tile in a grid (docked, floating, in a window), what
 * the theme registers as `frames.gridRoom`: less than the art reaches, as
 * neighbours' ivy may overlap, with room under each tile for its name.
 * Two columns of tiles 120 wide, the dock's smallest, still fit a docked
 * dock of 300 beside the trunk.
 */
export const GRID_ROOM = {
  top: 0.058,
  right: 0.058,
  bottom: 0.128,
  left: 0.058,
};

export const inBox = (box: Box, [x, y]: Point): boolean =>
  x > box.left && x < box.right && y > box.top && y < box.bottom;

/** Inside the picture, at least `pad` from its edges. */
export const inView = ([x, y]: Point, pad: number): boolean =>
  x > pad && x < VIEW.width - pad && y > pad && y < VIEW.height - pad;

export const lerp = (from: number, to: number, t: number): number =>
  from + (to - from) * t;

/** Fails on a number the art can't draw, rather than draw it at 0. */
function finite(n: number): number {
  if (!Number.isFinite(n))
    throw new RangeError(`The art has no place for ${String(n)}`);
  return n;
}

/** A number as the art writes it: one decimal (a negative zero is "0"). */
export const num = (n: number): string =>
  String(Math.round(finite(n) * 10) / 10);

/** A number to the nearest unit, for shapes where a quarter pixel is lost. */
export const whole = (n: number): string => String(Math.round(finite(n)));

export const at = ([x, y]: Point, write = num): string =>
  `${write(x)} ${write(y)}`;

/**
 * A smooth open path through the points (a Catmull-Rom spline as cubic
 * Béziers; after the first, each takes its first handle from the one before).
 */
export function curve(points: readonly Point[], write = num): string {
  const [first, second] = points;
  if (!first || !second) return "";
  const handle = (i: number): Point => {
    const before = points[Math.max(0, i - 1)] ?? first;
    const here = points[i] ?? first;
    const after = points[Math.min(points.length - 1, i + 1)] ?? here;
    return [
      here[0] - (after[0] - before[0]) / 6,
      here[1] - (after[1] - before[1]) / 6,
    ];
  };
  const start: Point = [
    first[0] + (second[0] - first[0]) / 6,
    first[1] + (second[1] - first[1]) / 6,
  ];
  const rest = points
    .slice(2)
    .map((p, i) => `S${at(handle(i + 2), write)} ${at(p, write)}`);
  return `M${at(first, write)}C${at(start, write)} ${at(handle(1), write)} ${at(second, write)}${rest.join("")}`;
}

/** The corner a tile's vines grow from. */
export type Origin = "tl" | "tr" | "bl" | "br";
export const ORIGINS = ["tl", "tr", "bl", "br"] as const;

export interface Mirror {
  point(p: Point): Point;
  /** A direction, in radians. */
  angle(a: number): number;
}

/** Art is grown from the top left; the other corners are its mirror images. */
export function mirrorFor(origin: Origin): Mirror {
  const acrossX = origin.endsWith("r");
  const acrossY = origin.startsWith("b");
  return {
    point: ([x, y]) => [
      acrossX ? VIEW.width - x : x,
      acrossY ? VIEW.height - y : y,
    ],
    angle: (a) => {
      const flipped = acrossX ? Math.PI - a : a;
      return acrossY ? -flipped : flipped;
    },
  };
}
