import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Files a module serves as they are (worklets, WASM, models) that come
 * from an npm package rather than its own `public/`: listed in its
 * package.json as `modularAV.assets`, published path → package export,
 * e.g. `"models/rnnoise.wasm": "@sapphi-red/web-noise-suppressor/rnnoise.wasm"`.
 * The build copies them into `dist/` and the test harness serves them, so
 * nothing is vendored (handoff §2). Published path → absolute source file.
 */
export type AssetMap = ReadonlyMap<string, string>;

/** Segments of letters, digits, `_`, `-` and `.`, never `.` or `..`. */
export const isSafePath = (path: string): boolean =>
  path.length > 0 &&
  path.split("/").every((s) => /^[\w.-]+$/.test(s) && s !== "." && s !== "..");

/** A bare specifier with a subpath: `name/file` or `@scope/name/file`. */
const isPackageExport = (source: string): boolean => {
  if (!isSafePath(source.replace(/^@/, ""))) return false;
  const parts = source.split("/");
  return parts.length > (source.startsWith("@") ? 2 : 1);
};

function readMap(packageDir: string): Readonly<Record<string, string>> {
  const pkg = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  ) as { modularAV?: { assets?: unknown } };
  const assets = pkg.modularAV?.assets;
  if (assets === undefined) return {};
  const valid =
    typeof assets === "object" &&
    assets !== null &&
    !Array.isArray(assets) &&
    Object.values(assets).every((v) => typeof v === "string");
  if (!valid)
    throw new Error(
      `${packageDir}: modularAV.assets must map published paths to package exports`,
    );
  return assets as Readonly<Record<string, string>>;
}

export function readAssets(packageDir: string): AssetMap {
  const require = createRequire(join(packageDir, "package.json"));
  const entries = Object.entries(readMap(packageDir)).map(([path, source]) => {
    if (!isSafePath(path))
      throw new Error(
        `${packageDir}: unsafe published path ${JSON.stringify(path)}`,
      );
    if (!isPackageExport(source))
      throw new Error(
        `${packageDir}: ${JSON.stringify(source)} is not a package export`,
      );
    try {
      return [path, require.resolve(source)] as const;
    } catch (error: unknown) {
      throw new Error(`${packageDir}: cannot resolve ${source}`, {
        cause: error,
      });
    }
  });
  return new Map(entries);
}
