import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isSafePath } from "./assets.ts";

/**
 * Worker scripts a module serves, listed in its package.json as
 * `modularAV.workers`, published path → source under `src/`, e.g.
 * `"worker.js": "src/worker/main.ts"`. The build bundles each as an entry
 * of its own next to the module's, and the test harness serves it from
 * source; the module starts it with `api.assetUrl(id, "worker.js")`.
 */
export interface WorkerEntry {
  /** The bundle's entry name: the published path without `.js`. */
  readonly name: string;
  readonly path: string;
  /** Absolute. */
  readonly source: string;
}

export function readWorkers(packageDir: string): readonly WorkerEntry[] {
  const pkg = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  ) as { modularAV?: { workers?: unknown } };
  const workers = pkg.modularAV?.workers;
  if (workers === undefined) return [];
  if (
    typeof workers !== "object" ||
    workers === null ||
    !Object.values(workers).every((v) => typeof v === "string")
  )
    throw new Error(
      `${packageDir}: modularAV.workers must map published paths to sources`,
    );
  return Object.entries(workers as Record<string, string>).map(
    ([path, source]) => {
      if (!isSafePath(path))
        throw new Error(
          `${packageDir}: unsafe published path ${JSON.stringify(path)}`,
        );
      if (!path.endsWith(".js"))
        throw new Error(`${packageDir}: ${path} must be a .js file`);
      if (!source.startsWith("src/") || !isSafePath(source))
        throw new Error(`${packageDir}: ${source} must be a file under src/`);
      return {
        name: path.slice(0, -".js".length),
        path,
        source: join(packageDir, source),
      };
    },
  );
}
