// The stats branch's README.md: the charts, a row per module, what each count
// means and how to show a badge. Images use raw URLs on the branch, the same
// ones the main README's card and the package READMEs' badges use.
import { formatCount, formatDate } from "./format.ts";
import { GROUPS } from "./parts.ts";
import type { DownloadLine } from "./series.ts";

export interface ModuleRow {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly total: number;
  readonly change: string;
  /** "0.13.2: 19", or "none" before a first release. */
  readonly latest: string;
}

export interface ReadmeSpec {
  /** Raw URL of the stats branch, without a trailing slash. */
  readonly base: string;
  /** Web URL of the stats branch, for the badge's link. */
  readonly page: string;
  readonly latest: readonly DownloadLine[];
  readonly modules: readonly ModuleRow[];
  readonly hasTraffic: boolean;
}

/** An image shown in the viewer's GitHub theme. */
export const picture = (base: string, name: string, alt: string): string =>
  [
    "<picture>",
    `  <source media="(prefers-color-scheme: dark)" srcset="${base}/${name}-dark.svg">`,
    `  <img alt="${alt}" src="${base}/${name}-light.svg">`,
    "</picture>",
  ].join("\n");

function modulesTable(rows: readonly ModuleRow[]): string[] {
  return [
    "| Module | Group | Downloads so far | Change | Latest release |",
    "| --- | --- | ---: | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.group} | ${formatCount(r.total)} | ${r.change} | ${r.latest} |`,
    ),
  ];
}

function meanings(): string[] {
  return [
    "Each module's count is the downloads of its zip over all its releases: Foundry installing or updating it. An update of the whole set downloads every installed module again, so these are downloads, not people.",
    "",
    ...GROUPS.map((g) => `- **${g.name}**: ${g.meaning}`),
    "- **Manifest lookups** (`module.json` in each release, in the table of files only): Foundry and foundryvtt.com reading a release's manifest, mostly for the modules listed there. These are lookups, not installs.",
    "- **Not counted**: the `dev` prerelease, which is rebuilt with every development build, so its counts start over. Manifest URLs on the `manifests` branch have no counter either; the zip download that follows them is counted.",
  ];
}

function filesTable(latest: readonly DownloadLine[]): string[] {
  return [
    "<details>",
    "<summary>Every release file</summary>",
    "",
    "| Release | File | Downloads |",
    "| --- | --- | ---: |",
    ...latest
      .toSorted(
        (a, b) => a.tag.localeCompare(b.tag) || a.asset.localeCompare(b.asset),
      )
      .map((l) => `| ${l.tag} | ${l.asset} | ${formatCount(l.downloads)} |`),
    "",
    "</details>",
  ];
}

function badgeHelp(base: string, page: string): string[] {
  const example = "modular-av-dock";
  return [
    "## Badges",
    "",
    `Every module has a badge, \`badge-<module id>-light.svg\` and \`-dark.svg\`. In a README on GitHub, the \`<picture>\` follows the viewer's theme:`,
    "",
    "```html",
    `<a href="${page}">`,
    picture(base, `badge-${example}`, "Downloads"),
    "</a>",
    "```",
    "",
    "Where only one image fits, such as a package page on foundryvtt.com, use either file on its own:",
    "",
    "```html",
    `<a href="${page}"><img alt="Downloads" src="${base}/badge-${example}-dark.svg"></a>`,
    "```",
  ];
}

function charts(base: string, hasTraffic: boolean): string[] {
  return [
    picture(base, "card", "Downloads so far, by group"),
    "",
    picture(base, "downloads", "Downloads so far, day by day"),
    "",
    picture(base, "modules", "Downloads so far, by module"),
    "",
    ...(hasTraffic
      ? [picture(base, "traffic", "Repository visitors per day"), ""]
      : []),
  ];
}

export function statsReadme(spec: ReadmeSpec): string {
  const date = spec.latest[0]?.date;
  const updated = date ? ` Last snapshot: ${formatDate(date, true)}.` : "";
  return [
    "# Modular A/V download counts",
    "",
    `Written once a day by the Download counts workflow (\`.github/workflows/stats.yml\` on \`main\`).${updated} Do not edit by hand: the next run replaces this file, the charts and the badges.`,
    "",
    ...charts(spec.base, spec.hasTraffic),
    "## Modules",
    "",
    ...modulesTable(spec.modules),
    "",
    "## What is counted",
    "",
    ...meanings(),
    "",
    ...filesTable(spec.latest),
    "",
    ...badgeHelp(spec.base, spec.page),
    "",
    "## Data",
    "",
    "- [`downloads.csv`](downloads.csv): every release file's total, once a day. The difference between two days is that day's downloads. A deleted release takes its downloads out of the totals.",
    "- [`traffic.csv`](traffic.csv): GitHub's views and clones per day, with unique visitors. GitHub keeps only 14 days; this keeps them all. Unique cloners are mostly automated. Referrers are not saved: they name people's own Foundry servers.",
    "",
  ].join("\n");
}
