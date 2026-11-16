// A small badge with one module's downloads so far and the change over the
// last week, for that package's README and its foundryvtt.com page. It has
// its own background, so it reads on any page; the README picks the light or
// dark file with the viewer's theme.
import { formatCount } from "./format.ts";
import { type Series, change } from "./series.ts";
import {
  type Theme,
  colorOf,
  frame,
  keyLine,
  textWidth,
  tspan,
} from "./svg.ts";

export interface BadgeSpec {
  readonly points: Series;
  readonly slot: number | undefined;
  /** What it counts, for screen readers: "Dock downloads". */
  readonly label: string;
}

const HEIGHT = 28;
const PAD = 10;
const WORD = "downloads";

export function badge(spec: BadgeSpec, theme: Theme): string {
  const total = formatCount(spec.points.at(-1)?.value ?? 0);
  const delta = change(spec.points);
  const grew = delta?.startsWith("+") ?? false;
  const textX = PAD + 20;
  const width =
    textX +
    textWidth(WORD, 12) +
    6 +
    textWidth(total, 13) +
    (delta === undefined ? 0 : 8 + textWidth(delta, 12)) +
    PAD;
  const runs = [
    tspan(total, { dx: 6, size: 13, weight: 600, fill: theme.primary }),
    ...(delta === undefined
      ? []
      : [tspan(delta, { dx: 8, fill: grew ? theme.good : theme.muted })]),
  ].join("");
  const label = `${spec.label}: ${total}${delta === undefined ? "" : `, ${delta}`}`;
  return frame(width, HEIGHT, label, theme, [
    keyLine(PAD, 14, colorOf(spec.slot, theme)),
    `<text x="${textX}" y="18" font-size="12" fill="${theme.secondary}">${WORD}${runs}</text>`,
  ]);
}
