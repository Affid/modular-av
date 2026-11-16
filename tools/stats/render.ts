// Every file the stats branch shows, drawn from its CSV files: the card for
// the main README, the charts, a badge per module and the README. Pure; the
// CLI (cli.ts render) reads the CSV files and writes what this returns.
import { badge } from "./badge.ts";
import { barChart } from "./bars.ts";
import { summaryCard } from "./card.ts";
import { lineChart } from "./chart.ts";
import { formatDate } from "./format.ts";
import { REPOSITORY } from "../release/manifest.ts";
import {
  CARD_GROUPS,
  GROUPS,
  MODULES,
  type ModuleEntry,
  classify,
  groupOf,
  versionOf,
} from "./parts.ts";
import { type ModuleRow, statsReadme } from "./readme.ts";
import {
  type DownloadLine,
  type Series,
  change,
  fromFirstVisit,
  groupTotals,
  latestDownloads,
  moduleTotals,
  parseDownloads,
  parseTraffic,
} from "./series.ts";
import { THEMES, type Theme } from "./svg.ts";

export const RAW_BASE = `https://raw.githubusercontent.com/${REPOSITORY}/stats`;
export const STATS_PAGE = `https://github.com/${REPOSITORY}/tree/stats`;

export interface StatsInput {
  readonly downloads: string;
  readonly traffic: string;
  /** Raw URL of the stats branch, for the README's images. */
  readonly base: string;
}

export interface StatsOutput {
  /** File contents by name. */
  readonly files: ReadonlyMap<string, string>;
  /** Release files nothing in parts.ts stands for. */
  readonly warnings: readonly string[];
}

interface Data {
  readonly modules: ReadonlyMap<string, Series>;
  readonly groups: ReadonlyMap<string, Series>;
  readonly traffic: ReturnType<typeof parseTraffic>;
}

const pointsOf = (map: ReadonlyMap<string, Series>, id: string): Series =>
  map.get(id) ?? [];

const CARD_FOOTNOTE =
  "Zip downloads from GitHub releases: installs and updates. The starter set and manifest lookups are left out.";

function card(data: Data, theme: Theme): string {
  const tiles = CARD_GROUPS.map(groupOf).map((g) => ({
    label: g.name,
    points: pointsOf(data.groups, g.id),
    slot: g.slot,
  }));
  return summaryCard(
    { title: "Modular A/V downloads", footnote: CARD_FOOTNOTE, tiles },
    theme,
  );
}

function downloadsChart(data: Data, theme: Theme): string {
  const lines = GROUPS.map((g) => {
    const points = pointsOf(data.groups, g.id);
    return {
      name: g.name,
      points,
      slot: g.slot,
      legendValue: points.at(-1)?.value ?? 0,
    };
  });
  return lineChart(
    {
      title: "Downloads so far",
      subtitle: "Zip downloads of each group's modules, day by day",
      lines,
    },
    theme,
  );
}

const totalOf = (data: Data, m: ModuleEntry): number =>
  pointsOf(data.modules, m.id).at(-1)?.value ?? 0;

/** Modules by group, the most downloaded first within each. */
function ordered(data: Data): ModuleEntry[] {
  return GROUPS.flatMap((g) =>
    MODULES.filter((m) => m.group === g.id).toSorted(
      (a, b) => totalOf(data, b) - totalOf(data, a),
    ),
  );
}

function modulesChart(data: Data, theme: Theme): string {
  const rows = ordered(data).map((m) => ({
    label: m.name,
    group: m.group,
    value: totalOf(data, m),
    slot: groupOf(m.group).slot,
    note: change(pointsOf(data.modules, m.id)),
  }));
  return barChart(
    {
      title: "Downloads by module",
      subtitle:
        "Zip downloads so far over all releases, with the change over the last 7 days",
      legend: GROUPS.map((g) => ({ name: g.name, slot: g.slot })),
      rows,
    },
    theme,
  );
}

function trafficChart(data: Data, theme: Theme): string | undefined {
  if (!data.traffic.length) return undefined;
  const series = (
    value: (d: (typeof data.traffic)[number]) => number,
  ): Series => data.traffic.map((d) => ({ date: d.date, value: value(d) }));
  return lineChart(
    {
      title: "Repository visitors",
      subtitle:
        "Unique visitors and unique cloners per day, from GitHub traffic",
      lines: [
        { name: "Visitors", points: series((d) => d.viewUniques), slot: 0 },
        { name: "Cloners", points: series((d) => d.cloneUniques), slot: 1 },
      ],
    },
    theme,
  );
}

function badges(data: Data, theme: Theme): [string, string][] {
  return MODULES.map((m) => [
    `badge-${m.id}`,
    badge(
      {
        points: pointsOf(data.modules, m.id),
        slot: groupOf(m.group).slot,
        label: `${m.name} downloads`,
      },
      theme,
    ),
  ]);
}

/** Every SVG for one theme, by file name without the theme suffix. */
function images(data: Data, theme: Theme): [string, string][] {
  const traffic = trafficChart(data, theme);
  return [
    ["card", card(data, theme)],
    ["downloads", downloadsChart(data, theme)],
    ["modules", modulesChart(data, theme)],
    ...(traffic ? [["traffic", traffic] as [string, string]] : []),
    ...badges(data, theme),
  ];
}

const versionParts = (version: string): number[] =>
  version.split(/[.-]/).slice(0, 3).map(Number);

function newer(a: string, b: string): boolean {
  const [x, y] = [versionParts(a), versionParts(b)];
  const i = x.findIndex((n, k) => n !== y[k]);
  if (i >= 0) return (x[i] ?? 0) > (y[i] ?? 0);
  // The same numbers: a release is newer than its own prereleases.
  return !a.includes("-") && b.includes("-");
}

/** "0.13.2: 19" for the module's newest release in the snapshot. */
function latestRelease(latest: readonly DownloadLine[], id: string): string {
  const zips = latest.flatMap((l) => {
    const file = classify(l.tag, l.asset);
    const version = versionOf(l.tag);
    return file.kind === "zip" && file.module.id === id && version
      ? [{ version, downloads: l.downloads }]
      : [];
  });
  const best = zips.reduce<(typeof zips)[number] | undefined>(
    (top, z) => (!top || newer(z.version, top.version) ? z : top),
    undefined,
  );
  return best ? `${best.version}: ${best.downloads}` : "none";
}

function moduleRows(data: Data, latest: readonly DownloadLine[]): ModuleRow[] {
  return ordered(data).map((m) => {
    const points = pointsOf(data.modules, m.id);
    const first = points[0];
    return {
      id: m.id,
      name: m.name,
      group: groupOf(m.group).name,
      total: totalOf(data, m),
      change:
        change(points) ??
        (first ? `counting since ${formatDate(first.date)}` : ""),
      latest: latestRelease(latest, m.id),
    };
  });
}

export function renderStats(input: StatsInput): StatsOutput {
  const lines = parseDownloads(input.downloads);
  if (!lines.length) throw new Error("No data in downloads.csv");
  const modules = moduleTotals(lines);
  const data: Data = {
    modules,
    groups: groupTotals(modules),
    traffic: fromFirstVisit(parseTraffic(input.traffic)),
  };
  const latest = latestDownloads(lines);
  const svgs = Object.values(THEMES).flatMap((theme) =>
    images(data, theme).map(
      ([name, svg]) => [`${name}-${theme.name}.svg`, svg] as const,
    ),
  );
  const readme = statsReadme({
    base: input.base,
    page: STATS_PAGE,
    latest,
    modules: moduleRows(data, latest),
    hasTraffic: data.traffic.length > 0,
  });
  const warnings = latest
    .filter((l) => classify(l.tag, l.asset).kind === "unknown")
    .map((l) => `Not counted: ${l.tag}/${l.asset}`);
  return { files: new Map([...svgs, ["README.md", readme]]), warnings };
}
