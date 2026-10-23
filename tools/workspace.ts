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

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

async function readModule(dir: string): Promise<readonly ModulePackage[]> {
  let manifestText: string;
  try {
    manifestText = await readFile(join(dir, "module.json"), "utf8");
  } catch (error: unknown) {
    if (isMissing(error)) return []; // a library package, not a Foundry module
    throw error;
  }
  try {
    const manifest = JSON.parse(manifestText) as { id?: unknown };
    const pkg = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as {
      version?: unknown;
    };
    if (typeof manifest.id !== "string" || typeof pkg.version !== "string")
      return [];
    return [{ dir, id: manifest.id, version: pkg.version }];
  } catch (error: unknown) {
    throw new Error(`${dir}: cannot read module.json or package.json`, {
      cause: error,
    });
  }
}

/** Workspace packages that are Foundry modules (have a `module.json`). */
export async function listModulePackages(
  root = ROOT,
): Promise<readonly ModulePackage[]> {
  const names = (await readdir(join(root, "packages"))).sort();
  const found = await Promise.all(
    names.map((name) => readModule(join(root, "packages", name))),
  );
  return found.flat();
}
