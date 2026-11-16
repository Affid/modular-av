// Shared pieces of the stats images (chart.ts, bars.ts, card.ts, badge.ts):
// themes, scales and SVG text. The SVGs are shown as images in READMEs,
// where GitHub runs no scripts, so they are static; light and dark are
// separate files picked by a <picture> element, which follows the viewer's
// GitHub theme.
import { dateOfDay, dayNumber, escapeXml } from "./format.ts";

export type ThemeName = "light" | "dark";

export interface Theme {
  readonly name: ThemeName;
  readonly surface: string;
  readonly border: string;
  readonly primary: string;
  readonly secondary: string;
  readonly muted: string;
  readonly grid: string;
  readonly axis: string;
  readonly spark: string;
  readonly good: string;
  /** For a thing without a colour slot, such as the starter set. */
  readonly neutral: string;
  /**
   * Categorical slots in fixed order (core, services, dock, sound & camera),
   * checked for colour-blind separation. Light green and amber are under 3:1
   * on white, so every colour also has a visible label.
   */
  readonly series: readonly [string, string, string, string];
}

// Surfaces are GitHub's own page colours, so the card sits flush in a README.
export const THEMES: Readonly<Record<ThemeName, Theme>> = {
  light: {
    name: "light",
    surface: "#ffffff",
    border: "#d1d9e0",
    primary: "#1f2328",
    secondary: "#59636e",
    muted: "#6e7781",
    grid: "#eaeef2",
    axis: "#c8d1da",
    spark: "#8c959f",
    good: "#1a7f37",
    neutral: "#8c959f",
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  },
  dark: {
    name: "dark",
    surface: "#0d1117",
    border: "#3d444d",
    primary: "#f0f6fc",
    secondary: "#9198a1",
    muted: "#9198a1",
    grid: "#21262d",
    axis: "#3d444d",
    spark: "#656c76",
    good: "#3fb950",
    neutral: "#7d8590",
    series: ["#3987e5", "#d95926", "#199e70", "#c98500"],
  },
};

export const FONT = `system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
/** Average glyph width as a share of the font size; on the wide side, so text fits. */
const GLYPH = 0.6;

export const colorOf = (slot: number | undefined, theme: Theme): string =>
  (slot === undefined ? undefined : theme.series[slot]) ?? theme.neutral;

/** Roughly how wide a line of text renders; good enough to place things. */
export const textWidth = (text: string, size: number): number =>
  text.length * size * GLYPH;

export const round = (n: number): number => Math.round(n * 10) / 10;

/** Round axis steps (1, 2, 5 x 10^n, whole numbers) from zero past `max`. */
export function niceTicks(max: number, most = 4): number[] {
  const top = Math.max(max, 1);
  const rough = Math.max(top / most, 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10;
  const count = Math.ceil(top / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/** Up to `most` evenly spaced days from first to last, as dates. */
export function dateTicks(first: string, last: string, most = 6): string[] {
  const from = dayNumber(first);
  const span = dayNumber(last) - from;
  const count = Math.min(most, span + 1);
  if (count <= 1) return [first];
  const days = Array.from({ length: count }, (_, i) =>
    Math.round(from + (i * span) / (count - 1)),
  );
  return [...new Set(days)].map(dateOfDay);
}

export interface TextOptions {
  readonly size: number;
  readonly fill: string;
  readonly weight?: number;
  readonly anchor?: "start" | "middle" | "end";
}

export function text(
  x: number,
  y: number,
  content: string,
  options: TextOptions,
): string {
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  const anchor =
    options.anchor && options.anchor !== "start"
      ? ` text-anchor="${options.anchor}"`
      : "";
  return `<text x="${round(x)}" y="${round(y)}" font-size="${options.size}" fill="${options.fill}"${weight}${anchor}>${escapeXml(content)}</text>`;
}

/** A bold or coloured run inside a <text>, placed by the browser after the last one. */
export function tspan(
  content: string,
  options: {
    readonly fill: string;
    readonly dx: number;
    readonly size?: number;
    readonly weight?: number;
  },
): string {
  const size = options.size ? ` font-size="${options.size}"` : "";
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  return `<tspan dx="${options.dx}"${size}${weight} fill="${options.fill}">${escapeXml(content)}</tspan>`;
}

/** The outer frame: a rounded card with an accessible title. */
export function frame(
  width: number,
  height: number,
  label: string,
  theme: Theme,
  body: readonly string[],
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${height}" viewBox="0 0 ${round(width)} ${height}" role="img" aria-label="${escapeXml(label)}" font-family='${FONT}'>`,
    `<title>${escapeXml(label)}</title>`,
    `<rect x="0.5" y="0.5" width="${round(width - 1)}" height="${height - 1}" rx="6" fill="${theme.surface}" stroke="${theme.border}"/>`,
    ...body,
    `</svg>`,
    "",
  ].join("\n");
}

/** A short coloured stroke that keys a label to its colour. */
export const keyLine = (x: number, y: number, color: string): string =>
  `<line x1="${round(x)}" x2="${round(x + 14)}" y1="${round(y)}" y2="${round(y)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;

/** A dot with a ring in the surface colour, so it reads over lines. */
export const endDot = (
  x: number,
  y: number,
  color: string,
  theme: Theme,
): string =>
  `<circle cx="${round(x)}" cy="${round(y)}" r="4" fill="${color}" stroke="${theme.surface}" stroke-width="2"/>`;

export const polyline = (
  points: readonly (readonly [number, number])[],
  color: string,
  width: number,
): string =>
  `<path d="${points.map(([x, y], i) => `${i ? "L" : "M"}${round(x)} ${round(y)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;

export interface LegendItem {
  readonly name: string;
  readonly slot: number | undefined;
  /** Shown in bold after the name, e.g. the latest total. */
  readonly value?: string;
}

const LEGEND_GAP = 24;
const KEY = 14;

const legendWidth = (item: LegendItem): number =>
  KEY +
  6 +
  textWidth(item.name, 12) +
  (item.value === undefined ? 0 : 6 + textWidth(item.value, 12)) +
  LEGEND_GAP;

/** A row of keyed names, the value of each in a <tspan> so the browser places it. */
export function legend(
  items: readonly LegendItem[],
  x: number,
  y: number,
  theme: Theme,
): string[] {
  const starts = items.map((_, i) =>
    items.slice(0, i).reduce((at, item) => at + legendWidth(item), x),
  );
  return items.flatMap((item, i) => {
    const at = starts[i] ?? x;
    const value =
      item.value === undefined
        ? ""
        : tspan(item.value, { dx: 6, weight: 600, fill: theme.primary });
    return [
      keyLine(at, y - 4, colorOf(item.slot, theme)),
      `<text x="${round(at + KEY + 6)}" y="${y}" font-size="12" fill="${theme.secondary}">${escapeXml(item.name)}${value}</text>`,
    ];
  });
}
