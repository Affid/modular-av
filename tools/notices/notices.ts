import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

/** One third-party package found in a bundle. */
export interface BundledPackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  /** LICENSE and NOTICE texts, as Apache-2.0 and others ask to ship. */
  readonly texts: readonly string[];
}

const NODE_MODULES = `${sep}node_modules${sep}`;

/**
 * The package directories behind bundled module ids: the part after the
 * last `node_modules/`, plus the scope for `@scope/name`.
 */
export function packageDirs(moduleIds: Iterable<string>): readonly string[] {
  const dirs = new Set<string>();
  for (const id of moduleIds) {
    const clean = id.replace(/^\0/, "").split("?")[0] ?? "";
    const at = clean.lastIndexOf(NODE_MODULES);
    if (at < 0) continue;
    const rest = clean.slice(at + NODE_MODULES.length).split(sep);
    const depth = rest[0]?.startsWith("@") ? 2 : 1;
    if (rest.length <= depth) continue;
    dirs.add(
      clean.slice(0, at + NODE_MODULES.length) + rest.slice(0, depth).join(sep),
    );
  }
  return [...dirs].sort();
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/** Node's lookup: `node_modules/<name>` in this directory or any above. */
async function resolveDependency(
  from: string,
  name: string,
): Promise<string | null> {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", ...name.split("/"));
    if (await exists(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

async function dependenciesOf(dir: string): Promise<readonly string[]> {
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
    dependencies?: Readonly<Record<string, string>>;
  };
  const names = Object.keys(pkg.dependencies ?? {});
  const found = await Promise.all(names.map((n) => resolveDependency(dir, n)));
  return found.filter((d): d is string => d !== null);
}

/**
 * Adds every runtime dependency, recursively. Some packages ship
 * pre-bundled (livekit-client inlines its dependencies into one file), so
 * the bundle's module ids alone miss code that is in the zip.
 */
export async function withDependencies(
  dirs: readonly string[],
): Promise<readonly string[]> {
  const seen = new Set<string>();
  let queue = [...dirs];
  while (queue.length > 0) {
    const fresh = queue.filter((d) => !seen.has(d));
    for (const d of fresh) seen.add(d);
    queue = (await Promise.all(fresh.map(dependenciesOf))).flat();
  }
  return [...seen].sort();
}

const LICENSE_FILE = /^(licen[cs]e|notice|copying)(\.(md|txt))?$/i;

export async function readPackage(dir: string): Promise<BundledPackage> {
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
    license?: unknown;
  };
  const files = (await readdir(dir)).filter((f) => LICENSE_FILE.test(f)).sort();
  const texts = await Promise.all(
    files.map((f) => readFile(join(dir, f), "utf8")),
  );
  return {
    name: typeof pkg.name === "string" ? pkg.name : dir,
    version: typeof pkg.version === "string" ? pkg.version : "?",
    license: typeof pkg.license === "string" ? pkg.license : "UNKNOWN",
    texts: texts.map((t) => t.trim()),
  };
}

/** Licences every module zip may contain (handoff §2). */
export const ALLOWED_LICENSES: ReadonlySet<string> = new Set([
  "MIT",
  "ISC",
  "0BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
]);

/**
 * Whether an SPDX expression is allowed: with `OR` one branch must be, with
 * `AND` every part. Nested parentheses are not used by our dependencies.
 */
export function isAllowedLicense(expression: string): boolean {
  const flat = expression.replace(/[()]/g, " ").trim();
  return flat
    .split(/\s+OR\s+/)
    .some((branch) =>
      branch.split(/\s+AND\s+/).every((id) => ALLOWED_LICENSES.has(id.trim())),
    );
}

export function disallowed(
  packages: readonly BundledPackage[],
): readonly BundledPackage[] {
  return packages.filter((p) => !isAllowedLicense(p.license));
}

/**
 * The module's own notices file (written by hand: what it is, why) plus a
 * generated section per bundled package, with its licence texts.
 */
export function renderNotices(
  header: string,
  packages: readonly BundledPackage[],
): string {
  if (packages.length === 0) return header;
  const sections = packages.map((p) => {
    const body =
      p.texts.length > 0
        ? p.texts.map((t) => `\`\`\`text\n${t}\n\`\`\``).join("\n\n")
        : "No licence file is included in the package.";
    return `### ${p.name} ${p.version} (${p.license})\n\n${body}`;
  });
  return `${header.trimEnd()}\n\n## Bundled packages\n\nGenerated at build time from the code in this module's files.\n\n${sections.join("\n\n")}\n`;
}
