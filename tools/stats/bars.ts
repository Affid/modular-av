// Every module's downloads so far as horizontal bars, coloured by group, for
// the stats branch's README. Sixteen modules are too many lines for one line
// chart and too many colours for anyone to tell apart; bars with their names
// beside them need neither.
import { formatCount } from "./format.ts";
import {
  type LegendItem,
  type Theme,
  colorOf,
  frame,
  legend,
  round,
  text,
  tspan,
} from "./svg.ts";

export interface BarRow {
  readonly label: string;
  /** Rows of one group sit together; a gap separates groups. */
  readonly group: string;
  readonly value: number;
  readonly slot: number | undefined;
  /** Shown after the value, e.g. "+4 in 7 days". */
  readonly note: string | undefined;
}

export interface BarSpec {
  readonly title: string;
  readonly subtitle: string;
  readonly legend: readonly LegendItem[];
  readonly rows: readonly BarRow[];
  readonly width?: number;
}

const PAD = 24;
const LEGEND_Y = 82;
const FIRST_ROW = 116;
const ROW = 26;
const GROUP_GAP = 10;
const BAR = 12;
const LABEL_WIDTH = 170;
const VALUE_WIDTH = 160;
const BOTTOM = 18;

/** Each row's vertical centre, with a gap wherever the group changes. */
function rowCentres(rows: readonly BarRow[]): number[] {
  return rows.map(
    (_, i) =>
      FIRST_ROW +
      i * ROW +
      rows.slice(1, i + 1).filter((r, j) => r.group !== rows[j]?.group).length *
        GROUP_GAP,
  );
}

function bar(
  row: BarRow,
  y: number,
  left: number,
  scale: number,
  theme: Theme,
): string[] {
  const length = row.value * scale;
  const grew = row.note?.startsWith("+") ?? false;
  const note =
    row.note === undefined
      ? ""
      : tspan(row.note, {
          dx: 8,
          weight: 400,
          fill: grew ? theme.good : theme.muted,
        });
  const value = `<text x="${round(left + length + 8)}" y="${round(y + 4)}" font-size="12" font-weight="600" fill="${theme.primary}">${formatCount(row.value)}${note}</text>`;
  return [
    text(left - 10, y + 4, row.label, {
      size: 12,
      fill: theme.secondary,
      anchor: "end",
    }),
    ...(length > 0
      ? [
          `<rect x="${round(left)}" y="${round(y - BAR / 2)}" width="${round(length)}" height="${BAR}" rx="2" fill="${colorOf(row.slot, theme)}"/>`,
        ]
      : []),
    value,
  ];
}

export function barChart(spec: BarSpec, theme: Theme): string {
  const width = spec.width ?? 800;
  const centres = rowCentres(spec.rows);
  const height = (centres.at(-1) ?? FIRST_ROW) + ROW / 2 + BOTTOM;
  const left = PAD + LABEL_WIDTH + 10;
  const longest = Math.max(1, ...spec.rows.map((r) => r.value));
  const scale = (width - PAD - VALUE_WIDTH - left) / longest;
  return frame(width, height, `${spec.title}. ${spec.subtitle}`, theme, [
    text(PAD, 38, spec.title, { size: 16, weight: 600, fill: theme.primary }),
    text(PAD, 58, spec.subtitle, { size: 12, fill: theme.secondary }),
    ...legend(spec.legend, PAD, LEGEND_Y, theme),
    ...spec.rows.flatMap((row, i) =>
      bar(row, centres[i] ?? FIRST_ROW, left, scale, theme),
    ),
  ]);
}
