import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { strToU8, zipSync } from "fflate";
import { releaseUrls } from "./manifest.ts";

export interface PackedModule {
  /** The release `module.json`: also published on the manifests branch. */
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly zip: Uint8Array;
}

async function listFiles(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"),
    )
    .sort();
}

/**
 * Zips a built module for release. The zip's `module.json` gets the stable
 * manifest URL and this release's download URL, so installs update.
 */
export async function packModule(
  distDir: string,
  id: string,
  version: string,
): Promise<PackedModule> {
  const built = JSON.parse(
    await readFile(join(distDir, "module.json"), "utf8"),
  ) as Record<string, unknown>;
  if (built.id !== id)
    throw new Error(
      `dist/module.json is for "${String(built.id)}", not "${id}"`,
    );
  if (built.version !== version) {
    throw new Error(
      `dist/module.json has version ${String(built.version)}, expected ${version}`,
    );
  }
  const manifest = { ...built, ...releaseUrls(id, version) };
  const files = await listFiles(distDir);
  const contents = await Promise.all(
    files.map(async (file) =>
      file === "module.json"
        ? ([file, strToU8(`${JSON.stringify(manifest, null, 2)}\n`)] as const)
        : ([
            file,
            new Uint8Array(await readFile(join(distDir, file))),
          ] as const),
    ),
  );
  return { manifest, zip: zipSync(Object.fromEntries(contents), { level: 9 }) };
}
