import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");

export interface ModulePackage {
  /** Absolute path of the package directory. */
  readonly dir: string;
  /** The Foundry package id from `module.json`. */
  readonly id: string;
  readonly version: string;
}

/** Workspace packages that are Foundry modules (have a `module.json`). */
export async function listModulePackages(
  root = ROOT,
): Promise<readonly ModulePackage[]> {
  const names = await readdir(join(root, "packages"));
  const found = await Promise.all(
    names.sort().map(async (name) => {
      const dir = join(root, "packages", name);
      try {
        const manifest = JSON.parse(
          await readFile(join(dir, "module.json"), "utf8"),
        ) as {
          id?: unknown;
        };
        const pkg = JSON.parse(
          await readFile(join(dir, "package.json"), "utf8"),
        ) as {
          version?: unknown;
        };
        if (typeof manifest.id !== "string" || typeof pkg.version !== "string")
          return [];
        return [{ dir, id: manifest.id, version: pkg.version }];
      } catch {
        // Not a Foundry module (no module.json): a library package.
        return [];
      }
    }),
  );
  return found.flat();
}
