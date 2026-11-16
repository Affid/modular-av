// The stats branch's CSV files (csv.ts) read back as the day-by-day series
// the charts draw (render.ts).
import { dataLines } from "./csv.ts";
import { dayNumber, formatCount, formatDate } from "./format.ts";
import { GROUPS, type GroupId, MODULES, classify } from "./parts.ts";

export interface Point {
  readonly date: string;
  readonly value: number;
}

export type Series = readonly Point[];

export interface DownloadLine {
  readonly date: string;
  readonly tag: string;
  readonly asset: string;
  readonly downloads: number;
}

export interface TrafficDay {
  readonly date: string;
  readonly views: number;
  readonly viewUniques: number;
  readonly clones: number;
  readonly cloneUniques: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNT = /^\d+$/;
const WEEK = 7;

/** A CSV line split into fields, checked: a date, then `counts` numbers last. */
function fields(
  line: string,
  size: number,
  counts: number,
  what: string,
): readonly string[] {
  const parts = line.split(",");
  const valid =
    parts.length === size &&
    DATE.test(parts[0] ?? "") &&
    parts.slice(size - counts).every((p) => COUNT.test(p));
  if (!valid) throw new Error(`Unexpected ${what} line: ${line}`);
  return parts;
}

export function parseDownloads(csv: string): DownloadLine[] {
  return dataLines(csv).map((line) => {
    const [date = "", tag = "", asset = "", downloads] = fields(
      line,
      4,
      1,
      "downloads",
    );
    return { date, tag, asset, downloads: Number(downloads) };
  });
}

export function parseTraffic(csv: string): TrafficDay[] {
  return dataLines(csv).map((line) => {
    const [date = "", ...counts] = fields(line, 5, 4, "traffic");
    const [views = 0, viewUniques = 0, clones = 0, cloneUniques = 0] =
      counts.map(Number);
    return { date, views, viewUniques, clones, cloneUniques };
  });
}

const datesOf = (lines: readonly DownloadLine[]): string[] =>
  [...new Set(lines.map((l) => l.date))].toSorted();

/** Zip downloads per module on each day, summed over its versions. */
function zipsByDay(
  lines: readonly DownloadLine[],
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const days = new Map<string, Map<string, number>>();
  for (const line of lines) {
    const file = classify(line.tag, line.asset);
    if (file.kind !== "zip") continue;
    const day = days.get(line.date) ?? new Map<string, number>();
    day.set(file.module.id, (day.get(file.module.id) ?? 0) + line.downloads);
    days.set(line.date, day);
  }
  return days;
}

/** Each module's zip downloads so far, one point per snapshot day. */
export function moduleTotals(
  lines: readonly DownloadLine[],
): ReadonlyMap<string, Series> {
  const dates = datesOf(lines);
  const days = zipsByDay(lines);
  return new Map(
    MODULES.map((m) => [
      m.id,
      dates.map((date) => ({ date, value: days.get(date)?.get(m.id) ?? 0 })),
    ]),
  );
}

const sum = (series: readonly Series[]): Series =>
  (series[0] ?? []).map((p, i) => ({
    date: p.date,
    value: series.reduce((total, s) => total + (s[i]?.value ?? 0), 0),
  }));

/** Each group's total: its modules' series added day by day. */
export function groupTotals(
  modules: ReadonlyMap<string, Series>,
): ReadonlyMap<GroupId, Series> {
  return new Map(
    GROUPS.map((g) => [
      g.id,
      sum(
        MODULES.filter((m) => m.group === g.id).map(
          (m) => modules.get(m.id) ?? [],
        ),
      ),
    ]),
  );
}

/** The lines of the newest snapshot. */
export function latestDownloads(
  lines: readonly DownloadLine[],
): DownloadLine[] {
  const last = datesOf(lines).at(-1);
  return lines.filter((l) => l.date === last);
}

/** "+5 in 7 days", or since the first count while there is less history. */
export function change(points: Series): string | undefined {
  const last = points.at(-1);
  if (!last || points.length < 2) return undefined;
  const since = dayNumber(last.date) - WEEK;
  const from = points.find((p) => dayNumber(p.date) >= since) ?? last;
  const base = from === last ? (points.at(-2) ?? last) : from;
  const diff = last.value - base.value;
  const sign = diff > 0 ? "+" : "";
  const period =
    dayNumber(base.date) === since
      ? `in ${WEEK} days`
      : `since ${formatDate(base.date)}`;
  return `${sign}${formatCount(diff)} ${period}`;
}

/** The days from the first one with any traffic on, so a quiet start is not drawn. */
export function fromFirstVisit(days: readonly TrafficDay[]): TrafficDay[] {
  const first = days.findIndex((d) => d.views + d.clones > 0);
  return first < 0 ? [] : days.slice(first);
}
