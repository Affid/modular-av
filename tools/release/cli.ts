// Manual releases while GitHub Actions is unavailable (docs/RELEASING.md).
//   node tools/release/cli.ts pack [module-id]          build and zip into release/
//   node tools/release/cli.ts publish <module-id>       show what would happen
//   node tools/release/cli.ts publish <module-id> --yes tag, release, update manifests
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { listModulePackages, type ModulePackage, ROOT } from "../workspace.ts";
import { releaseHold } from "./hold.ts";
import { MANIFESTS_BRANCH, tagFor } from "./manifest.ts";
import { packModule } from "./pack.ts";

const OUT = join(ROOT, "release");

function run(command: string, args: readonly string[], cwd = ROOT): void {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function capture(command: string, args: readonly string[], cwd = ROOT): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

async function pack(
  mod: ModulePackage,
): Promise<{ zip: string; manifest: string }> {
  run("pnpm", ["--filter", `./${relative(ROOT, mod.dir)}`, "run", "build"]);
  const packed = await packModule(join(mod.dir, "dist"), mod.id, mod.version);
  const dir = join(OUT, mod.id);
  await mkdir(dir, { recursive: true });
  const zip = join(dir, `${mod.id}.zip`);
  const manifest = join(dir, "module.json");
  await writeFile(zip, packed.zip);
  await writeFile(manifest, `${JSON.stringify(packed.manifest, null, 2)}\n`);
  console.log(
    `${mod.id} ${mod.version}: ${relative(ROOT, zip)} (${String(packed.zip.length)} bytes)`,
  );
  return { zip, manifest };
}

function succeeds(
  command: string,
  args: readonly string[],
  cwd = ROOT,
): boolean {
  try {
    execFileSync(command, args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The commit a tag points at locally, or undefined if there is no such tag. */
function tagCommit(tag: string): string | undefined {
  return succeeds("git", [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/tags/${tag}`,
  ])
    ? capture("git", ["rev-parse", `${tag}^{commit}`])
    : undefined;
}

/**
 * Publishing may be re-run after a partial failure: an existing tag is fine
 * if it points at HEAD, and every later step skips what is already done.
 */
function preflight(tag: string): readonly string[] {
  if (!succeeds("git", ["remote", "get-url", "origin"])) {
    return ["no origin remote: create the GitHub repository and push first"];
  }
  const problems: string[] = [];
  if (capture("git", ["status", "--porcelain"]))
    problems.push("the working tree has changes");
  if (capture("git", ["branch", "--show-current"]) !== "main")
    problems.push("not on main");
  run("git", ["fetch", "--quiet", "origin", "main", "--tags"]);
  const head = capture("git", ["rev-parse", "HEAD"]);
  if (head !== capture("git", ["rev-parse", "origin/main"])) {
    problems.push("HEAD is not origin/main: push or pull first");
  }
  const tagged = tagCommit(tag);
  if (tagged && tagged !== head)
    problems.push(`tag ${tag} exists on another commit`);
  return problems;
}

function ensureTag(tag: string, message: string): void {
  if (!tagCommit(tag)) run("git", ["tag", "-a", tag, "-m", message]);
  if (!capture("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`])) {
    run("git", ["push", "origin", `refs/tags/${tag}`]);
  }
}

function ensureRelease(
  tag: string,
  title: string,
  assets: readonly string[],
  prerelease: boolean,
): void {
  if (succeeds("gh", ["release", "view", tag])) {
    run("gh", ["release", "upload", tag, ...assets, "--clobber"]);
    return;
  }
  run("gh", [
    "release",
    "create",
    tag,
    ...assets,
    "--title",
    title,
    "--notes",
    "Install or update with the manifest URL in the README.",
    ...(prerelease ? ["--prerelease"] : []),
  ]);
}

async function updateManifestsBranch(
  id: string,
  version: string,
  manifest: string,
): Promise<void> {
  const tree = await mkdtemp(join(tmpdir(), "mav-manifests-"));
  let added = false;
  try {
    run("git", ["worktree", "add", "--detach", tree]);
    added = true;
    if (capture("git", ["ls-remote", "--heads", "origin", MANIFESTS_BRANCH])) {
      run("git", ["fetch", "origin", MANIFESTS_BRANCH], tree);
      run("git", ["checkout", "-B", MANIFESTS_BRANCH, "FETCH_HEAD"], tree);
    } else {
      run("git", ["checkout", "--orphan", MANIFESTS_BRANCH], tree);
      run("git", ["rm", "-rf", "--quiet", "."], tree);
    }
    await mkdir(join(tree, id), { recursive: true });
    await copyFile(manifest, join(tree, id, "module.json"));
    run("git", ["add", join(id, "module.json")], tree);
    if (succeeds("git", ["diff", "--cached", "--quiet"], tree)) {
      console.log(
        `${id}/module.json on ${MANIFESTS_BRANCH} is already current`,
      );
      return;
    }
    run(
      "git",
      ["commit", "-m", `chore: publish the ${id} ${version} manifest`],
      tree,
    );
    run("git", ["push", "origin", MANIFESTS_BRANCH], tree);
  } finally {
    if (added) run("git", ["worktree", "remove", "--force", tree]);
    await rm(tree, { recursive: true, force: true });
  }
}

async function publish(mod: ModulePackage, confirmed: boolean): Promise<void> {
  const tag = tagFor(mod.id, mod.version);
  const problems = preflight(tag);
  if (problems.length > 0)
    throw new Error(`Cannot publish ${tag}: ${problems.join("; ")}`);
  const files = await pack(mod);
  // A prerelease must not reach players on the stable manifest URL.
  const prerelease = mod.version.includes("-");
  const steps = [
    `create and push tag ${tag} (unless done)`,
    `create GitHub release ${tag} with ${mod.id}.zip and module.json (or update its files)`,
    prerelease
      ? `leave the ${MANIFESTS_BRANCH} branch alone: ${mod.version} is a prerelease`
      : `update ${mod.id}/module.json on the ${MANIFESTS_BRANCH} branch and push it`,
  ];
  if (!confirmed) {
    console.log(`Dry run. With --yes this would:\n  - ${steps.join("\n  - ")}`);
    return;
  }
  ensureTag(tag, `${mod.id} ${mod.version}`);
  ensureRelease(
    tag,
    `${mod.id} ${mod.version}`,
    [files.zip, files.manifest],
    prerelease,
  );
  if (!prerelease)
    await updateManifestsBranch(mod.id, mod.version, files.manifest);
}

const [command, id] = process.argv.slice(2);
const modules = await listModulePackages();
const named = id ? modules.filter((m) => m.id === id) : modules;
if (id && named.length === 0) throw new Error(`No module "${id}" in packages/`);
const held = new Map(
  await Promise.all(
    named.map(async (m) => [m.id, await releaseHold(m.dir)] as const),
  ),
);
for (const [heldId, reason] of held)
  if (reason) console.log(`${heldId}: held back, ${reason}`);
if (id && held.get(id)) throw new Error(`${id} is held back from releases`);
const selected = named.filter((m) => !held.get(m.id));

if (command === "pack") {
  for (const mod of selected) await pack(mod);
} else if (command === "publish" && id && selected[0]) {
  await publish(selected[0], process.argv.includes("--yes"));
} else {
  console.error("Usage: cli.ts pack [module-id] | publish <module-id> [--yes]");
  process.exitCode = 1;
}
