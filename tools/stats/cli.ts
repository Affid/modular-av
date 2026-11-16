// Download counts for the `stats` branch (.github/workflows/stats.yml runs
// both, once a day, on a worktree of that branch):
//   node tools/stats/cli.ts snapshot <folder>  save today's release downloads
//                                             (downloads.csv) and GitHub's
//                                             views and clones (traffic.csv)
//   node tools/stats/cli.ts render <folder>    draw the card, charts, badges
//                                             and README.md from them
// Downloads are public: GITHUB_TOKEN only raises the rate limit. Traffic
// needs STATS_TOKEN (docs/RELEASING.md, Download counts); without it, or
// when GitHub refuses it, traffic.csv is left as it is.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { downloadRows, mergeDownloads, mergeTraffic } from "./csv.ts";
import { allReleases, apiGetter, trafficAnswers } from "./github.ts";
import { RAW_BASE, renderStats } from "./render.ts";

const read = (file: string): string =>
  existsSync(file) ? readFileSync(file, "utf8") : "";

async function snapshot(folder: string): Promise<void> {
  mkdirSync(folder, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const downloads = join(folder, "downloads.csv");
  const releases = await allReleases(apiGetter(process.env.GITHUB_TOKEN ?? ""));
  const rows = downloadRows(releases);
  writeFileSync(downloads, mergeDownloads(read(downloads), rows, today));
  console.log(`${today}: ${rows.length} release files counted.`);

  const statsToken = process.env.STATS_TOKEN ?? "";
  if (!statsToken) {
    console.log("No STATS_TOKEN: traffic not saved.");
    return;
  }
  const traffic = join(folder, "traffic.csv");
  try {
    const { views, clones } = await trafficAnswers(apiGetter(statsToken));
    writeFileSync(traffic, mergeTraffic(read(traffic), views, clones));
    console.log(`${today}: views and clones saved.`);
  } catch (error: unknown) {
    // An expired token mustn't cost the day's downloads, saved above.
    const why = error instanceof Error ? error.message : String(error);
    console.log(`::warning::Traffic not saved: ${why}`);
  }
}

function render(folder: string): void {
  const { files, warnings } = renderStats({
    downloads: read(join(folder, "downloads.csv")),
    traffic: read(join(folder, "traffic.csv")),
    base: RAW_BASE,
  });
  for (const [name, content] of files)
    writeFileSync(join(folder, name), content);
  // A workflow annotation, so a new kind of release file gets noticed.
  for (const warning of warnings) console.log(`::warning::${warning}`);
  console.log(`Wrote ${files.size} files.`);
}

const [command, folder] = process.argv.slice(2);
const USAGE = "Usage: node tools/stats/cli.ts snapshot|render <folder>";

try {
  if (!folder) throw new Error(USAGE);
  if (command === "snapshot") await snapshot(folder);
  else if (command === "render") render(folder);
  else throw new Error(USAGE);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
