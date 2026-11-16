// Download and traffic counts kept as CSV on the `stats` branch, one snapshot
// a day (.github/workflows/stats.yml). GitHub keeps only running totals for
// release downloads and 14 days of traffic, so the history exists only if it
// is saved. The files hold GitHub's numbers as they are: what each file
// stands for is decided when the charts are drawn (parts.ts), so a change
// there applies to every day already saved.

export const DOWNLOADS_HEADER = "date,tag,asset,downloads";
export const TRAFFIC_HEADER = "date,views,view_uniques,clones,clone_uniques";

export interface DownloadRow {
  readonly tag: string;
  readonly asset: string;
  readonly downloads: number;
}

type Json = Readonly<Record<string, unknown>>;

export const isJson = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A CSV field. GitHub's tag and asset names never hold commas or quotes, and
 * this repository's hold nothing that would break the README's tables.
 */
function field(value: string, what: string): string {
  if (!value || /[",\r\n|<>`]/.test(value)) {
    throw new Error(`Unexpected ${what} name: ${JSON.stringify(value)}`);
  }
  return value;
}

function assetRows(tag: string, assets: unknown): DownloadRow[] {
  if (!Array.isArray(assets)) throw new Error(`No asset list for ${tag}`);
  return assets.map((a: unknown) => {
    if (
      !isJson(a) ||
      typeof a.name !== "string" ||
      typeof a.download_count !== "number"
    ) {
      throw new Error(`Unexpected asset in ${tag}: ${JSON.stringify(a)}`);
    }
    return { tag, asset: field(a.name, "asset"), downloads: a.download_count };
  });
}

const byTagThenAsset = (a: DownloadRow, b: DownloadRow): number =>
  a.tag.localeCompare(b.tag) || a.asset.localeCompare(b.asset);

/** GitHub's list of releases as one row per attached file. */
export function downloadRows(releases: unknown): DownloadRow[] {
  if (!Array.isArray(releases)) {
    throw new Error(`Expected a list of releases: ${JSON.stringify(releases)}`);
  }
  const rows = releases
    .flatMap((r: unknown) => {
      if (!isJson(r) || typeof r.tag_name !== "string") {
        throw new Error(`Unexpected release: ${JSON.stringify(r)}`);
      }
      return assetRows(field(r.tag_name, "tag"), r.assets);
    })
    .toSorted(byTagThenAsset);
  // An empty answer would wipe the day's lines: GitHub had a bad moment.
  if (!rows.length) throw new Error("GitHub listed no release files");
  return rows;
}

/** The data lines of a CSV file, without its header or blank lines. */
export const dataLines = (csv: string): string[] =>
  csv
    .split("\n")
    .slice(1)
    .filter((l) => l.trim() !== "");

const withHeader = (header: string, lines: readonly string[]): string =>
  [header, ...lines, ""].join("\n");

/** Today's totals added to the file; a rerun on the same day replaces them. */
export function mergeDownloads(
  csv: string,
  rows: readonly DownloadRow[],
  date: string,
): string {
  const kept = dataLines(csv).filter((l) => !l.startsWith(`${date},`));
  const added = rows.map((r) => `${date},${r.tag},${r.asset},${r.downloads}`);
  // ISO dates first in each line, so a plain sort keeps days in order.
  return withHeader(DOWNLOADS_HEADER, [...kept, ...added].toSorted());
}

interface Day {
  readonly count: number;
  readonly uniques: number;
}

/** GitHub's daily counts by date (YYYY-MM-DD). */
function days(answer: unknown, key: "views" | "clones"): Map<string, Day> {
  const list = isJson(answer) ? answer[key] : undefined;
  if (!Array.isArray(list)) {
    throw new Error(`Expected daily ${key}: ${JSON.stringify(answer)}`);
  }
  return new Map(
    list.map((d: unknown): [string, Day] => {
      if (
        !isJson(d) ||
        typeof d.timestamp !== "string" ||
        typeof d.count !== "number" ||
        typeof d.uniques !== "number"
      ) {
        throw new Error(`Unexpected ${key} day: ${JSON.stringify(d)}`);
      }
      return [d.timestamp.slice(0, 10), { count: d.count, uniques: d.uniques }];
    }),
  );
}

const NONE: Day = { count: 0, uniques: 0 };

/**
 * GitHub's last 14 days of views and clones merged into the file: older days
 * kept, the days GitHub still reports replaced by its newer counts.
 * Referrers are never saved: they name people's own Foundry servers, and the
 * branch is public.
 */
export function mergeTraffic(
  csv: string,
  viewsAnswer: unknown,
  clonesAnswer: unknown,
): string {
  const views = days(viewsAnswer, "views");
  const clones = days(clonesAnswer, "clones");
  const fresh = [...new Set([...views.keys(), ...clones.keys()])].map((d) => {
    const v = views.get(d) ?? NONE;
    const c = clones.get(d) ?? NONE;
    return `${d},${v.count},${v.uniques},${c.count},${c.uniques}`;
  });
  const kept = dataLines(csv).filter(
    (l) => !views.has(l.slice(0, 10)) && !clones.has(l.slice(0, 10)),
  );
  return withHeader(TRAFFIC_HEADER, [...kept, ...fresh].toSorted());
}
