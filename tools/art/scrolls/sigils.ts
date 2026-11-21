// Arcane signs written with a pen that swells and thins: a row of them,
// large enough to read as drawn. Of the alchemists' kind, and a few of none.
import type { Box, Point } from "../vines/geometry.ts";
import type { Random } from "../vines/random.ts";
import { heightOf, widthOf } from "./geometry.ts";

const n = (v: number): string => String(Math.round(v * 10) / 10);

interface Stroke {
  readonly points: readonly Point[];
  /** Comes back to where it began: no thinning at its ends. */
  readonly loop?: boolean;
}

interface Sigil {
  readonly strokes: readonly Stroke[];
  readonly dots?: readonly Point[];
}

const ORIGIN: Point = [0, 0];

function arc(
  [cx, cy]: Point,
  [rx, ry]: Point,
  from: number,
  to: number,
  steps = 22,
): readonly Point[] {
  return Array.from({ length: steps + 1 }, (_, i): Point => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

const ring = (cx: number, cy: number, r: number): Stroke => ({
  points: arc([cx, cy], [r, r], 100, 460, 28),
  loop: true,
});
const line = (...points: readonly Point[]): Stroke => ({ points });
const closed = (...points: readonly Point[]): Stroke => ({
  points: [...points, points[0] ?? ORIGIN],
  loop: true,
});

/** A smooth line through points (Catmull-Rom). */
function smooth(points: readonly Point[], per = 8): readonly Point[] {
  const at = (i: number): Point =>
    points[Math.max(0, Math.min(points.length - 1, i))] ?? ORIGIN;
  const between = points.slice(0, -1).flatMap((_, i) =>
    Array.from({ length: per }, (_, k): Point => {
      const t = k / per;
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 *
        (2 * b +
          (c - a) * t +
          (2 * a - 5 * b + 4 * c - d) * t * t +
          (3 * b - a - 3 * c + d) * t * t * t);
      return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
    }),
  );
  return [...between, at(points.length - 1)];
}

const SPIRAL_STEPS = 33;
const spiral: Stroke = {
  points: Array.from({ length: SPIRAL_STEPS + 1 }, (_, i): Point => {
    const a = (i / SPIRAL_STEPS) * Math.PI * 3.3 + 0.6;
    const r = 0.46 - (i / SPIRAL_STEPS) * 0.38;
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r];
  }),
};

/** Each in a box one unit square, up positive. */
const SIGILS: readonly Sigil[] = [
  { strokes: [ring(0.5, 0.5, 0.4)], dots: [[0.5, 0.5]] },
  {
    strokes: [
      line(...arc([0.56, 0.5], [0.42, 0.44], 55, 305)),
      line(...arc([0.74, 0.5], [0.36, 0.36], 100, 260)),
    ],
  },
  { strokes: [closed([0.5, 0.95], [0.92, 0.12], [0.08, 0.12])] },
  {
    strokes: [
      closed([0.08, 0.9], [0.92, 0.9], [0.5, 0.06]),
      line([0.24, 0.5], [0.76, 0.5]),
    ],
  },
  { strokes: [ring(0.5, 0.5, 0.38), line([0.02, 0.5], [0.98, 0.5])] },
  {
    strokes: [
      closed([0.5, 0.98], [0.8, 0.52], [0.2, 0.52]),
      line([0.5, 0.52], [0.5, 0.02]),
      line([0.28, 0.24], [0.72, 0.24]),
    ],
  },
  {
    strokes: [
      ring(0.5, 0.52, 0.2),
      line(...arc([0.5, 0.94], [0.2, 0.2], 200, 340)),
      line([0.5, 0.32], [0.5, 0.0]),
      line([0.32, 0.14], [0.68, 0.14]),
    ],
  },
  {
    strokes: [
      ring(0.5, 0.28, 0.24),
      line([0.5, 0.52], [0.5, 1]),
      line([0.3, 0.8], [0.7, 0.8]),
    ],
  },
  { strokes: [spiral] },
  {
    strokes: [
      line([0.5, 1], [0.5, 0.04]),
      line(...arc([0.5, 0.64], [0.36, 0.34], 180, 360)),
      line([0.32, 0.06], [0.68, 0.06]),
    ],
  },
  {
    strokes: [
      line(
        ...smooth([
          [0.3, 1],
          [0.3, 0.42],
          [0.46, 0.64],
          [0.68, 0.56],
          [0.66, 0.26],
          [0.78, 0.04],
        ]),
      ),
      line([0.12, 0.82], [0.5, 0.82]),
    ],
  },
  {
    strokes: [closed([0.14, 0.92], [0.86, 0.92], [0.14, 0.08], [0.86, 0.08])],
  },
  {
    strokes: [
      line(
        ...smooth([
          [0.02, 0.5],
          [0.5, 0.84],
          [0.98, 0.5],
        ]),
      ),
      line(
        ...smooth([
          [0.02, 0.5],
          [0.5, 0.16],
          [0.98, 0.5],
        ]),
      ),
      ring(0.5, 0.5, 0.13),
    ],
  },
  {
    strokes: [
      line(
        ...smooth([
          [0.02, 0.62],
          [0.26, 0.8],
          [0.5, 0.64],
          [0.74, 0.48],
          [0.98, 0.66],
        ]),
      ),
      line(
        ...smooth([
          [0.02, 0.26],
          [0.26, 0.44],
          [0.5, 0.28],
          [0.74, 0.12],
          [0.98, 0.3],
        ]),
      ),
    ],
  },
  {
    strokes: [
      line([0.5, 0], [0.5, 0.98]),
      line([0.2, 0.66], [0.5, 0.98], [0.8, 0.66]),
      line([0.26, 0.3], [0.74, 0.3]),
    ],
  },
  {
    strokes: [
      ring(0.5, 0.5, 0.4),
      line([0.5, 0.1], [0.5, 0.9]),
      line([0.1, 0.5], [0.9, 0.5]),
    ],
  },
  {
    strokes: [
      line(...arc([0.5, 0.44], [0.34, 0.36], -35, 215)),
      ring(0.2, 0.2, 0.09),
      ring(0.8, 0.2, 0.09),
    ],
  },
  { strokes: [line([0.7, 1], [0.3, 0.56], [0.64, 0.5], [0.26, 0])] },
  {
    strokes: [closed([0.5, 0.98], [0.9, 0.5], [0.5, 0.02], [0.1, 0.5])],
    dots: [[0.5, 0.5]],
  },
  {
    strokes: [
      line([0.14, 0.02], [0.14, 0.98]),
      line(...arc([0.14, 0.7], [0.5, 0.28], 90, -90)),
      line([0.14, 0.42], [0.8, 0.02]),
    ],
  },
];

export const SIGIL_COUNT = SIGILS.length;

/** The angle the pen's nib is held at. */
const NIB = (40 * Math.PI) / 180;
/** A stroke's width, a dot's radius and a point's radius, as shares of a sign's height. */
const STROKE = 0.15;
const DOT = 0.085;
const POINT = 0.05;
/** How far along a stroke the pen is still landing, or already lifting. */
const TAPER = 0.16;

/** Points spread evenly along a line, corners kept. */
function dense(points: readonly Point[], step: number): readonly Point[] {
  return points.flatMap((p, i) => {
    const q = points[i + 1];
    if (!q) return [p];
    const count = Math.max(
      1,
      Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / step),
    );
    return Array.from({ length: count }, (_, k): Point => [
      p[0] + ((q[0] - p[0]) * k) / count,
      p[1] + ((q[1] - p[1]) * k) / count,
    ]);
  });
}

/** One stroke as a shape: wide across the nib, thin along it, and thinning where the pen lands and lifts. */
function brushed(stroke: Stroke, width: number): string {
  const points = dense(stroke.points, width * 0.6);
  const last = points.length - 1;
  const wide = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)] ?? p;
    const b = points[Math.min(last, i + 1)] ?? p;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const t = i / (last || 1);
    const taper = stroke.loop
      ? 1
      : Math.min(1, 0.4 + (0.6 * Math.min(t, 1 - t)) / TAPER);
    const w = width * (0.42 + 0.58 * Math.abs(Math.sin(angle - NIB))) * taper;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { p, w, nx: -(b[1] - a[1]) / length, ny: (b[0] - a[0]) / length };
  });
  const side = (way: number): readonly string[] =>
    wide.map(
      ({ p, w, nx, ny }) =>
        `${n(p[0] + (nx * w * way) / 2)} ${n(p[1] + (ny * w * way) / 2)}`,
    );
  const caps = stroke.loop
    ? ""
    : [wide[0], wide[last]]
        .map((end) =>
          end
            ? `<circle cx="${n(end.p[0])}" cy="${n(end.p[1])}" r="${n(end.w / 2)}"/>`
            : "",
        )
        .join("");
  return `<path d="M${side(1).join("L")}L${side(-1).toReversed().join("L")}Z"/>${caps}`;
}

/** A sign `size` high with its middle at `at`, turned a little. */
function sigil(sign: Sigil, at: Point, size: number, turn: number): string {
  const place = ([u, v]: Point): Point => [(u - 0.5) * size, (0.5 - v) * size];
  const strokes = sign.strokes
    .map((stroke) =>
      brushed({ ...stroke, points: stroke.points.map(place) }, size * STROKE),
    )
    .join("");
  const dots = (sign.dots ?? [])
    .map((dot) => {
      const [x, y] = place(dot);
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size * DOT)}"/>`;
    })
    .join("");
  return `<g transform="translate(${n(at[0])} ${n(at[1])}) rotate(${n(turn)})">${strokes}${dots}</g>`;
}

interface Written {
  readonly shapes: readonly string[];
  /** The sign last written: the next is another. */
  readonly before: number;
}

/**
 * A row of signs in a box, each a little off the line as a hand leaves
 * them, a point between some. Shapes to fill: they carry no colour.
 */
export function sigilRow(random: Random, box: Box): string {
  const [wide, tall] = [widthOf(box), heightOf(box)];
  const count = Math.max(3, Math.round(wide / (tall * 1.5)));
  const pitch = wide / count;
  const row = Array.from({ length: count }).reduce<Written>(
    ({ shapes, before }, _, i) => {
      const drawn = Math.floor(random.next() * SIGILS.length);
      const pick = drawn === before ? (drawn + 7) % SIGILS.length : drawn;
      const sign = SIGILS[pick];
      if (!sign) return { shapes, before };
      const at: Point = [
        box.left + pitch * (i + 0.5) + random.between(-0.05, 0.05) * pitch,
        box.top + tall / 2 + random.between(-0.04, 0.04) * tall,
      ];
      const point =
        i < count - 1 && random.next() < 0.4
          ? `<circle cx="${n(box.left + pitch * (i + 1))}" cy="${n(box.top + tall * random.between(0.44, 0.58))}" r="${n(tall * POINT)}"/>`
          : "";
      const size = tall * random.between(0.74, 0.84);
      const turn = random.between(-5, 5);
      return {
        shapes: [...shapes, sigil(sign, at, size, turn) + point],
        before: pick,
      };
    },
    { shapes: [], before: -1 },
  );
  return row.shapes.join("");
}
