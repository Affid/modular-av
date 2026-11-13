// Publishes the checkout as the rolling `dev` prerelease (docs/RELEASING.md).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { type ModulePackage, ROOT } from "../workspace.ts";
import {
  DEV_TAG,
  type DevModule,
  devManifest,
  devInstallUrl,
  devNotes,
  devVersion,
} from "./dev.ts";
import { packModule } from "./pack.ts";
import { capture, run, succeeds } from "./shell.ts";

const OUT = join(ROOT, "release", DEV_TAG);

/**
 * The dev tag moves with every build. A local copy (from a fetch that
 * followed it) goes stale, and then `git fetch --tags`, which
 * `release:publish` runs, refuses to overwrite it and fails.
 */
function dropLocalDevTag(): void {
  const ref = `refs/tags/${DEV_TAG}`;
  if (succeeds("git", ["rev-parse", "--verify", "--quiet", ref]))
    run("git", ["tag", "--delete", DEV_TAG]);
}

/** The release is built from a commit GitHub has, so the tree must match it. */
function devPreflight(): readonly string[] {
  if (!succeeds("git", ["remote", "get-url", "origin"]))
    return ["no origin remote"];
  const problems: string[] = [];
  if (capture("git", ["status", "--porcelain"]))
    problems.push("the working tree has changes: commit them first");
  dropLocalDevTag();
  run("git", ["fetch", "--quiet", "--no-tags", "origin"]);
  if (!capture("git", ["branch", "--remotes", "--contains", "HEAD"]))
    problems.push("HEAD isn't on origin: push the branch first");
  return problems;
}

async function packDev(
  mods: readonly ModulePackage[],
  at: Date,
): Promise<{ assets: readonly string[]; built: readonly DevModule[] }> {
  run("pnpm", [
    ...mods.flatMap((m) => ["--filter", `./${relative(ROOT, m.dir)}`]),
    "run",
    "build",
  ]);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const family = new Set(mods.map((m) => m.id));
  const packed = await Promise.all(
    mods.map(async (m) => {
      const version = devVersion(m.version, at);
      const { manifest, zip } = await packModule(
        join(m.dir, "dist"),
        m.id,
        m.version,
        (built) => devManifest(built, version, family),
      );
      const zipFile = join(OUT, `${m.id}.zip`);
      const manifestFile = join(OUT, `${m.id}.json`);
      await writeFile(zipFile, zip);
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
      return { files: [zipFile, manifestFile], module: { id: m.id, version } };
    }),
  );
  return {
    assets: packed.flatMap((p) => p.files),
    built: packed.map((p) => p.module),
  };
}

/** Replaces the dev release with this one, at the given commit. */
function replaceDevRelease(
  commit: string,
  assets: readonly string[],
  notes: string,
): void {
  if (succeeds("gh", ["release", "view", DEV_TAG]))
    run("gh", ["release", "delete", DEV_TAG, "--cleanup-tag", "--yes"]);
  run("gh", [
    "release",
    "create",
    DEV_TAG,
    ...assets,
    "--target",
    commit,
    "--title",
    "Development build",
    "--notes",
    notes,
    "--prerelease",
    "--latest=false",
  ]);
  dropLocalDevTag();
}

/**
 * Builds the given modules from the checkout and, with `confirmed`,
 * publishes them as the `dev` prerelease in place of the last one.
 * Returns what to tell the person running it.
 */
export async function publishDev(
  mods: readonly ModulePackage[],
  confirmed: boolean,
): Promise<string> {
  const problems = devPreflight();
  if (confirmed && problems.length > 0)
    throw new Error(`Cannot publish a dev build: ${problems.join("; ")}`);
  const commit = capture("git", ["rev-parse", "HEAD"]);
  const branch = capture("git", ["branch", "--show-current"]) || commit;
  const { assets, built } = await packDev(mods, new Date());
  const notes = devNotes(branch, commit, built);
  if (!confirmed)
    return [
      `Dry run, built in ${relative(ROOT, OUT)}/. With --yes this would replace`,
      ` the GitHub prerelease "${DEV_TAG}" (at ${commit}) with:\n\n${notes}`,
      ...problems.map((p) => `\nFirst fix: ${p}`),
    ].join("");
  replaceDevRelease(commit, assets, notes);
  const urls = built.map((m) => `  ${devInstallUrl(m.id, m.version)}`);
  return `Published. Install or update in Foundry with:\n${urls.join("\n")}`;
}
