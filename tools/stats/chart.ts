// A line chart over days, for the stats branch's README: one axis, a legend
// naming every line (with its latest value when asked), hairline grid.
import { dayNumber, formatCount, formatDate } from "./format.ts";
import type { Series } from "./series.ts";
import {
  type Theme,
  colorOf,
  dateTicks,
  endDot,
  frame,
  legend,
  niceTicks,
  polyline,
  text,
  textWidth,
} from "./svg.ts";

export interface Line {
  readonly name: string;
  readonly points: Series;
  /** Colour slot; fixed per thing counted, so a missing line repaints none. */
  readonly slot: number | undefined;
  /** Shown after the name in the legend, e.g. the latest total. */
  readonly legendValue?: number;
}

export interface ChartSpec {
  readonly title: string;
  readonly subtitle: string;
  readonly lines: readonly Line[];
  readonly width?: number;
  readonly height?: number;
}

const PAD = 24;
const PLOT_TOP = 104;
const PLOT_BOTTOM_GAP = 36;
const LEGEND_Y = 82;
const TICK_SIZE = 11;

interface Plot {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly x: (date: string) => number;
  readonly y: (value: number) => number;
  readonly ticks: readonly number[];
}

function plotArea(spec: ChartSpec, width: number, height: number): Plot {
  const all = spec.lines.flatMap((l) => l.points);
  const ticks = niceTicks(Math.max(0, ...all.map((p) => p.value)));
  const widest = Math.max(
    ...ticks.map((t) => textWidth(formatCount(t), TICK_SIZE)),
  );
  const left = PAD + widest + 8;
  const right = width - PAD - 8;
  const bottom = height - PLOT_BOTTOM_GAP;
  const days = all.map((p) => dayNumber(p.date));
  const first = Math.min(...days);
  const span = Math.max(...days) - first;
  const yTop = ticks.at(-1) ?? 1;
  return {
    left,
    right,
    bottom,
    ticks,
    x: (date) =>
      span === 0
        ? (left + right) / 2
        : left + ((dayNumber(date) - first) / span) * (right - left),
    y: (value) => bottom - (value / yTop) * (bottom - PLOT_TOP),
  };
}

function grid(plot: Plot, theme: Theme): string[] {
  return plot.ticks.flatMap((tick) => {
    const y = plot.y(tick);
    const color = tick === 0 ? theme.axis : theme.grid;
    return [
      `<line x1="${plot.left}" x2="${plot.right}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="1"/>`,
      text(plot.left - 8, y + 4, formatCount(tick), {
        size: TICK_SIZE,
        fill: theme.muted,
        anchor: "end",
      }),
    ];
  });
}

function anchorAt(i: number, count: number): "start" | "middle" | "end" {
  if (count === 1) return "middle";
  if (i === 0) return "start";
  return i === count - 1 ? "end" : "middle";
}

function xLabels(plot: Plot, dates: readonly string[], theme: Theme): string[] {
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return [];
  const ticks = dateTicks(first, last);
  return ticks.map((date, i) => {
    const withYear = i === 0 || ticks[i - 1]?.slice(0, 4) !== date.slice(0, 4);
    return text(plot.x(date), plot.bottom + 22, formatDate(date, withYear), {
      size: TICK_SIZE,
      fill: theme.muted,
      anchor: anchorAt(i, ticks.length),
    });
  });
}

function marks(lines: readonly Line[], plot: Plot, theme: Theme): string[] {
  return lines.flatMap((line) => {
    const color = colorOf(line.slot, theme);
    const points = line.points.map(
      (p) => [plot.x(p.date), plot.y(p.value)] as const,
    );
    const last = points.at(-1);
    if (!last) return [];
    return [polyline(points, color, 2), endDot(last[0], last[1], color, theme)];
  });
}

export function lineChart(spec: ChartSpec, theme: Theme): string {
  const width = spec.width ?? 800;
  const height = spec.height ?? 300;
  const plot = plotArea(spec, width, height);
  const dates = [
    ...new Set(spec.lines.flatMap((l) => l.points.map((p) => p.date))),
  ].toSorted();
  const items = spec.lines.map((l) => ({
    name: l.name,
    slot: l.slot,
    ...(l.legendValue === undefined
      ? {}
      : { value: formatCount(l.legendValue) }),
  }));
  return frame(width, height, `${spec.title}. ${spec.subtitle}`, theme, [
    text(PAD, 38, spec.title, { size: 16, weight: 600, fill: theme.primary }),
    text(PAD, 58, spec.subtitle, { size: 12, fill: theme.secondary }),
    ...legend(items, PAD, LEGEND_Y, theme),
    ...grid(plot, theme),
    ...xLabels(plot, dates, theme),
    ...marks(spec.lines, plot, theme),
  ]);
}
