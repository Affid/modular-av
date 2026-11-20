// Branches twisted into a bundle along any line: what the dock's trunk,
// its boughs and the lianas cameras hang on are made of, like the frames.
import {
  bark,
  type Branch,
  DARK,
  defined,
  stroke,
  type Sway,
  type Tone,
} from "./frame.ts";
import {
  blurFilter,
  type Box,
  curve,
  num,
  type Point,
  whole,
} from "./geometry.ts";
import { type PictureSize, svgDocument } from "./svg.ts";

const STEP = 26;
/** Strands this thin cast no shadow of their own. */
const THIN = 9;

/** A centre line: the point `off` to its side, `distance` along it. */
export interface Line {
  point(distance: number, off: number): Point;
}

/** A line from where its centre is at each distance; its side is to the left of the way it runs. */
export function lineOf(centre: (distance: number) => Point): Line {
  return {
    point(distance, off) {
      const [before, after] = [centre(distance - 2), centre(distance + 2)];
      const [dx, dy] = [after[0] - before[0], after[1] - before[1]];
      const length = Math.hypot(dx, dy) || 1;
      const at = centre(distance);
      return [at[0] - (dy / length) * off, at[1] + (dx / length) * off];
    },
  };
}

/** A line through points, straight between them, and how long it is. */
export function lineThrough(points: readonly Point[]): {
  readonly line: Line;
  readonly length: number;
} {
  const starts = points.reduce<readonly number[]>((sums, point, i) => {
    const last = points[i - 1];
    const step = last ? Math.hypot(point[0] - last[0], point[1] - last[1]) : 0;
    return [...sums, (sums.at(-1) ?? 0) + step];
  }, []);
  const centre = (distance: number): Point => {
    const found = starts.findLastIndex((start) => start <= distance);
    const i = Math.max(0, Math.min(points.length - 2, found));
    const [from, to] = [points[i] ?? [0, 0], points[i + 1] ?? [0, 0]];
    const span = (starts[i + 1] ?? 0) - (starts[i] ?? 0) || 1;
    const t = (distance - (starts[i] ?? 0)) / span;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  };
  return { line: lineOf(centre), length: starts.at(-1) ?? 0 };
}

/** One branch of a bundle: where along the line it runs, and how it sways. */
export interface Strand {
  readonly id: string;
  readonly width: number;
  readonly tone: Tone;
  readonly from: number;
  readonly to: number;
  readonly sway: Sway;
}

/** What was drawn, in the parts a picture is put together from. */
export interface Drawn {
  readonly defs: string;
  /** Its shadow's shapes. */
  readonly shadows: string;
  readonly art: string;
}

export const joined = (parts: readonly Drawn[]): Drawn => ({
  defs: parts.map((part) => part.defs).join(""),
  shadows: parts.map((part) => part.shadows).join(""),
  art: parts.map((part) => part.art).join(""),
});

const steps = (from: number, to: number, step: number): readonly number[] => {
  const count = Math.max(2, Math.ceil((to - from) / step));
  return Array.from(
    { length: count + 1 },
    (_, i) => from + ((to - from) * i) / count,
  );
};

/** Round windows over every other place two strands cross: there the first goes over. */
function overWindows(line: Line, first: Strand, second: Strand): string {
  const fine = steps(
    Math.max(first.from, second.from),
    Math.min(first.to, second.to),
    2,
  );
  const apart = (i: number): number => {
    const distance = fine[i] ?? 0;
    return first.sway(distance) - second.sway(distance);
  };
  const radius = Math.max(first.width, second.width) * 1.05;
  return fine
    .slice(0, -1)
    .filter((_, i) => apart(i) < 0 !== apart(i + 1) < 0)
    .filter((_, k) => k % 2 === 0)
    .map((distance) => {
      const centre = line.point(distance, first.sway(distance));
      return `<circle cx="${whole(centre[0])}" cy="${whole(centre[1])}" r="${whole(radius)}"/>`;
    })
    .join("");
}

/** Thinner than this a branch shows no grain: it is painted in three strokes, not seven. */
const GRAINED = 10;

/** A branch painted: with its bark's grain, or plainly when it is too thin to show any. */
function painted(branch: Branch): string {
  if (branch.width >= GRAINED) return bark(branch);
  const { id, width, tone } = branch;
  return (
    stroke(id, `stroke="${DARK}" stroke-width="${num(width + 3)}"`) +
    stroke(id, `stroke="${tone[0]}" stroke-width="${num(width)}"`) +
    stroke(
      id,
      `stroke="${tone[1]}" stroke-opacity=".7" stroke-width="${num(width * 0.26)}" transform="translate(${num(width * -0.16)} ${num(width * -0.22)})"`,
    )
  );
}

const shadowOf = (branches: readonly Branch[]): string =>
  branches
    .filter((branch) => branch.width > THIN)
    .map((branch) => stroke(branch.id, `stroke-width="${num(branch.width)}"`))
    .join("");

/**
 * Strands along a line, the first two twisted round each other, with any
 * `extra` branches under them. Every id starts with `prefix`.
 */
export function twist(
  prefix: string,
  line: Line,
  strands: readonly Strand[],
  extra: readonly Branch[] = [],
  step = STEP,
): Drawn {
  const woven = strands.map((strand): Branch => ({
    id: `${prefix}${strand.id}`,
    width: strand.width,
    tone: strand.tone,
    d: curve(
      steps(strand.from, strand.to, step).map((distance) =>
        line.point(distance, strand.sway(distance)),
      ),
      whole,
    ),
  }));
  const branches = [
    ...extra.map((branch) => ({ ...branch, id: `${prefix}${branch.id}` })),
    ...woven,
  ];
  const [first, second] = strands;
  const over = first && second ? overWindows(line, first, second) : "";
  const [top, ...rest] = woven;
  return {
    defs: `${defined(branches)}<clipPath id="${prefix}o">${over}</clipPath>`,
    shadows: shadowOf(branches),
    art:
      branches.map(painted).join("") +
      // Over again where it crosses on top, and the thin strands over that.
      `<g clip-path="url(#${prefix}o)">${top ? painted(top) : ""}</g>` +
      rest
        .slice(1)
        .filter((branch) => branch.width <= 13)
        .map(painted)
        .join(""),
  };
}

/** One branch through points. */
export function single(
  id: string,
  points: readonly Point[],
  width: number,
  tone: Tone,
): Drawn {
  const branch: Branch = { id, width, tone, d: curve(points, whole) };
  return {
    defs: defined([branch]),
    shadows: shadowOf([branch]),
    art: painted(branch),
  };
}

/** Where a picture's shadow falls, and how soft it is. */
export interface Shadow {
  readonly dx: number;
  readonly dy: number;
  readonly blur: number;
}

/** A picture of what was drawn over its shadow, with `over` (leaves, say) on top. */
export function picture(
  box: Box,
  drawn: Drawn,
  shadow: Shadow,
  over = "",
  size?: PictureSize,
): string {
  return svgDocument(
    `<defs>${drawn.defs}${blurFilter("fs", shadow.blur, box)}</defs>` +
      `<g fill="none" stroke-linejoin="round" stroke-linecap="round">` +
      `<g filter="url(#fs)" opacity=".55" transform="translate(${shadow.dx} ${shadow.dy})" stroke="#000">${drawn.shadows}</g>` +
      `${drawn.art}</g>${over}`,
    box,
    size,
  );
}
