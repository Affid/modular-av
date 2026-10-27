import { SCREEN_MARGIN } from "./on-screen.ts";
import { clamp, type Insets, NO_INSETS, type Rect, type Size } from "./rect.ts";

/** A corner or edge of the window a box is kept against. */
export type Anchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export const ANCHORS: readonly Anchor[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

/**
 * Where a box is, as an anchor and an offset: the box's point that matches
 * the anchor (its top right corner for "top-right", the middle of its top
 * edge for "top") sits `dx`, `dy` from that point of the window. It stays
 * against its corner or edge when the window is resized.
 */
export interface Anchored {
  readonly anchor: Anchor;
  readonly dx: number;
  readonly dy: number;
}

export const isAnchor = (value: unknown): value is Anchor =>
  ANCHORS.some((a) => a === value);

/** How far along each axis an anchor's point is: 0, a half or 1. */
function fractions(anchor: Anchor): readonly [number, number] {
  const x = anchor.endsWith("left") ? 0 : anchor.endsWith("right") ? 1 : 0.5;
  const y = anchor.startsWith("top")
    ? 0
    : anchor.startsWith("bottom")
      ? 1
      : 0.5;
  return [x, y];
}

/** The box of `size` placed at `where` in a window of `viewport`. */
export function placeAnchored(
  where: Anchored,
  size: Size,
  viewport: Size,
): Rect {
  const [fx, fy] = fractions(where.anchor);
  return {
    left: (viewport.width - size.width) * fx + where.dx,
    top: (viewport.height - size.height) * fy + where.dy,
    width: size.width,
    height: size.height,
  };
}

const third = (centre: number, length: number): 0 | 1 | 2 =>
  centre < length / 3 ? 0 : centre > (2 * length) / 3 ? 2 : 1;

const GRID: readonly (readonly Anchor[])[] = [
  ["top-left", "top", "top-right"],
  ["left", "top", "right"],
  ["bottom-left", "bottom", "bottom-right"],
];

/**
 * The anchor of the third of the window the box's centre is in (the middle
 * third takes the nearer of the top and bottom edges), and the offset that
 * keeps the box where it is.
 */
export function anchorOf(rect: Rect, viewport: Size): Anchored {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const col = third(cx, viewport.width);
  const row = third(cy, viewport.height);
  const middle = row === 1 && col === 1;
  const anchor = middle
    ? cy > viewport.height / 2
      ? "bottom"
      : "top"
    : (GRID[row]?.[col] ?? "top-left");
  const at = placeAnchored({ anchor, dx: 0, dy: 0 }, rect, viewport);
  return { anchor, dx: rect.left - at.left, dy: rect.top - at.top };
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

export interface AvoidOptions {
  /** Space kept from the window's edges and from what is avoided. */
  readonly margin?: number;
  /** How far something reaches past the box, e.g. a frame. */
  readonly reach?: Insets;
}

const grow = (r: Rect, by: Insets): Rect => ({
  left: r.left - by.left,
  top: r.top - by.top,
  width: r.width + by.left + by.right,
  height: r.height + by.top + by.bottom,
});

/** Positions along one axis worth trying: where it is, and either side of each obstacle. */
function stops(
  at: number,
  length: number,
  room: number,
  margin: number,
  edges: readonly (readonly [number, number])[],
): number[] {
  const fit = (v: number): number => clamp(v, margin, room - length - margin);
  return [
    fit(at),
    ...edges.flatMap(([start, end]) => [
      fit(start - length - margin),
      fit(end + margin),
    ]),
  ];
}

/**
 * The box kept on screen and out of `obstacles` (Foundry's sidebar, hotbar…),
 * frame and all, moved as little as it takes. Where no place is clear, it
 * stays where it is, on screen.
 */
export function avoid(
  rect: Rect,
  obstacles: readonly Rect[],
  viewport: Size,
  options: AvoidOptions = {},
): Rect {
  const margin = options.margin ?? SCREEN_MARGIN;
  const reach = options.reach ?? NO_INSETS;
  const outer = grow(rect, reach);
  const xs = stops(
    outer.left,
    outer.width,
    viewport.width,
    margin,
    obstacles.map((o) => [o.left, o.left + o.width] as const),
  );
  const ys = stops(
    outer.top,
    outer.height,
    viewport.height,
    margin,
    obstacles.map((o) => [o.top, o.top + o.height] as const),
  );
  const home = { ...outer, left: xs[0] ?? outer.left, top: ys[0] ?? outer.top };
  const keepOff = obstacles.map((o) => grow(o, all(margin)));
  const clear = xs
    .flatMap((left) => ys.map((top) => ({ ...outer, left, top })))
    .filter((r) => keepOff.every((o) => !overlaps(r, o)));
  const best =
    clear.reduce<Rect | null>(
      (a, b) => (a && distance(a, outer) <= distance(b, outer) ? a : b),
      null,
    ) ?? home;
  return {
    ...rect,
    left: best.left + reach.left,
    top: best.top + reach.top,
  };
}

const all = (v: number): Insets => ({ top: v, right: v, bottom: v, left: v });

const distance = (a: Rect, b: Rect): number =>
  (a.left - b.left) ** 2 + (a.top - b.top) ** 2;
