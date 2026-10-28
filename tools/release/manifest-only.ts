import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../workspace.ts";
import { distManifest } from "./manifest.ts";

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/**
 * The build of a module without code (the starter set, which only
 * requires others): what the Vite build emits besides a bundle, its
 * `module.json` with the version and relationship URLs, its language
 * files and the licence, in `dist/`.
 */
export async function buildManifestOnly(packageDir: string): Promise<void> {
  const source = JSON.parse(
    await readFile(join(packageDir, "module.json"), "utf8"),
  ) as Record<string, unknown>;
  const { version } = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8"),
  ) as { version?: unknown };
  if (typeof version !== "string")
    throw new Error(`${packageDir}: package.json has no version`);
  const dist = join(packageDir, "dist");
  await mkdir(join(dist, "lang"), { recursive: true });
  await writeFile(
    join(dist, "module.json"),
    `${JSON.stringify(distManifest(source, version), null, 2)}\n`,
  );
  const languages = await readdir(join(packageDir, "lang")).catch(
    (error: unknown) => {
      if (isMissing(error)) return [];
      throw error;
    },
  );
  for (const name of languages)
    await copyFile(join(packageDir, "lang", name), join(dist, "lang", name));
  await copyFile(join(ROOT, "LICENSE"), join(dist, "LICENSE"));
}

// `node tools/release/manifest-only.ts <package dir>` (the package's build).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await buildManifestOnly(resolve(process.argv[2] ?? "."));
