// The summary card: one tile per group with its total so far, the change
// over the last week and a small trend line. Made for the main README.
import { dayNumber, formatCount, formatDate } from "./format.ts";
import { type Series, change } from "./series.ts";
import {
  type Theme,
  colorOf,
  endDot,
  frame,
  keyLine,
  polyline,
  text,
  textWidth,
} from "./svg.ts";

export interface Tile {
  readonly label: string;
  readonly points: Series;
  /** Colour slot, the same as the group's line in the charts. */
  readonly slot: number | undefined;
}

export interface CardSpec {
  readonly title: string;
  readonly footnote: string;
  readonly tiles: readonly Tile[];
  readonly width?: number;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const PAD = 24;
const GAP = 16;
const HEIGHT = 178;
const SPARK_DAYS = 30;
const TOTAL_SIZE = 30;
/** Space between the total and the trend line, and the trend line's least width. */
const SPARK_GAP = 14;
const SPARK_MIN_WIDTH = 40;

function sparkline(
  points: Series,
  box: Box,
  color: string,
  theme: Theme,
): string[] {
  const recent = points.slice(-SPARK_DAYS);
  const last = recent.at(-1);
  if (!last) return [];
  const values = recent.map((p) => p.value);
  const low = Math.min(...values);
  const range = Math.max(...values) - low || 1;
  const first = dayNumber(recent[0]?.date ?? last.date);
  const span = dayNumber(last.date) - first || 1;
  const xy = recent.map(
    (p) =>
      [
        box.x + ((dayNumber(p.date) - first) / span) * box.w,
        box.y + box.h - ((p.value - low) / range) * box.h,
      ] as const,
  );
  const end = xy.at(-1) ?? [box.x + box.w, box.y + box.h];
  return [
    ...(xy.length > 1 ? [polyline(xy, theme.spark, 1.5)] : []),
    endDot(end[0], end[1], color, theme),
  ];
}

function tile(t: Tile, x: number, width: number, theme: Theme): string[] {
  const total = formatCount(t.points.at(-1)?.value ?? 0);
  const delta = change(t.points);
  const first = t.points[0];
  const note =
    delta ?? (first ? `counting since ${formatDate(first.date)}` : "no data");
  const grew = delta?.startsWith("+") ?? false;
  const color = colorOf(t.slot, theme);
  // The trend line starts after the total, however many digits it has.
  const offset = Math.min(
    textWidth(total, TOTAL_SIZE) + SPARK_GAP,
    width - SPARK_MIN_WIDTH - 8,
  );
  return [
    keyLine(x, 64, color),
    text(x + 20, 68, t.label, { size: 12, fill: theme.secondary }),
    text(x, 106, total, { size: TOTAL_SIZE, weight: 600, fill: theme.primary }),
    text(x, 128, note, { size: 12, fill: grew ? theme.good : theme.muted }),
    ...sparkline(
      t.points,
      { x: x + offset, y: 82, w: width - offset - 8, h: 26 },
      color,
      theme,
    ),
  ];
}

export function summaryCard(spec: CardSpec, theme: Theme): string {
  const width = spec.width ?? 800;
  const count = Math.max(spec.tiles.length, 1);
  const tileWidth = (width - 2 * PAD - (count - 1) * GAP) / count;
  const updated = spec.tiles[0]?.points.at(-1)?.date;
  return frame(width, HEIGHT, spec.title, theme, [
    text(PAD, 34, spec.title, { size: 14, weight: 600, fill: theme.primary }),
    ...(updated
      ? [
          text(width - PAD, 34, `Updated ${formatDate(updated, true)}`, {
            size: 12,
            fill: theme.muted,
            anchor: "end",
          }),
        ]
      : []),
    ...spec.tiles.flatMap((t, i) =>
      tile(t, PAD + i * (tileWidth + GAP), tileWidth, theme),
    ),
    text(PAD, HEIGHT - 16, spec.footnote, { size: 11, fill: theme.muted }),
  ]);
}
