// Manual releases while GitHub Actions is unavailable (docs/RELEASING.md).
//   node tools/release/cli.ts pack [module-id]          build and zip into release/
//   node tools/release/cli.ts publish <module-id>       show what would happen
//   node tools/release/cli.ts publish <module-id> --yes tag, release, update manifests
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { listModulePackages, type ModulePackage, ROOT } from "../workspace.ts";
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

function preflight(tag: string): readonly string[] {
  const problems: string[] = [];
  if (capture("git", ["status", "--porcelain"]))
    problems.push("the working tree has changes");
  if (capture("git", ["branch", "--show-current"]) !== "main")
    problems.push("not on main");
  run("git", ["fetch", "--quiet", "origin", "main"]);
  if (
    capture("git", ["rev-parse", "HEAD"]) !==
    capture("git", ["rev-parse", "origin/main"])
  )
    problems.push("HEAD is not origin/main: push or pull first");
  if (capture("git", ["tag", "--list", tag]))
    problems.push(`tag ${tag} exists locally`);
  if (capture("git", ["ls-remote", "--tags", "origin", tag]))
    problems.push(`tag ${tag} exists on origin`);
  return problems;
}

async function updateManifestsBranch(
  id: string,
  version: string,
  manifest: string,
): Promise<void> {
  const tree = await mkdtemp(join(tmpdir(), "mav-manifests-"));
  try {
    run("git", ["worktree", "add", "--detach", tree]);
    const remote = capture("git", [
      "ls-remote",
      "--heads",
      "origin",
      MANIFESTS_BRANCH,
    ]);
    if (remote) {
      run("git", ["fetch", "origin", MANIFESTS_BRANCH], tree);
      run("git", ["checkout", "-B", MANIFESTS_BRANCH, "FETCH_HEAD"], tree);
    } else {
      run("git", ["checkout", "--orphan", MANIFESTS_BRANCH], tree);
      run("git", ["rm", "-rf", "--quiet", "."], tree);
    }
    await mkdir(join(tree, id), { recursive: true });
    execFileSync("cp", [manifest, join(tree, id, "module.json")]);
    run("git", ["add", join(id, "module.json")], tree);
    run(
      "git",
      ["commit", "-m", `chore: publish the ${id} ${version} manifest`],
      tree,
    );
    run("git", ["push", "origin", MANIFESTS_BRANCH], tree);
  } finally {
    run("git", ["worktree", "remove", "--force", tree]);
    await rm(tree, { recursive: true, force: true });
  }
}

async function publish(mod: ModulePackage, confirmed: boolean): Promise<void> {
  const tag = tagFor(mod.id, mod.version);
  const problems = preflight(tag);
  if (problems.length > 0)
    throw new Error(`Cannot publish ${tag}: ${problems.join("; ")}`);
  const files = await pack(mod);
  const steps = [
    `create and push tag ${tag}`,
    `create GitHub release ${tag} with ${mod.id}.zip and module.json`,
    `update ${mod.id}/module.json on the ${MANIFESTS_BRANCH} branch and push it`,
  ];
  if (!confirmed) {
    console.log(`Dry run. With --yes this would:\n  - ${steps.join("\n  - ")}`);
    return;
  }
  run("git", ["tag", "-a", tag, "-m", `${mod.id} ${mod.version}`]);
  run("git", ["push", "origin", tag]);
  const prerelease = mod.version.includes("-") ? ["--prerelease"] : [];
  run("gh", [
    "release",
    "create",
    tag,
    files.zip,
    files.manifest,
    "--title",
    `${mod.id} ${mod.version}`,
    "--notes",
    `Install or update with the manifest URL in the README.`,
    ...prerelease,
  ]);
  await updateManifestsBranch(mod.id, mod.version, files.manifest);
}

const [command, id] = process.argv.slice(2);
const modules = await listModulePackages();
const selected = id ? modules.filter((m) => m.id === id) : modules;
if (id && selected.length === 0)
  throw new Error(`No module "${id}" in packages/`);

if (command === "pack") {
  for (const mod of selected) await pack(mod);
} else if (command === "publish" && id && selected[0]) {
  await publish(selected[0], process.argv.includes("--yes"));
} else {
  console.error("Usage: cli.ts pack [module-id] | publish <module-id> [--yes]");
  process.exitCode = 1;
}
