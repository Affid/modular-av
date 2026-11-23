import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSafePath } from "./assets.ts";

/**
 * Stylesheets a module serves as one file but keeps in parts, each a
 * cohesive section of a size to read: listed in its package.json as
 * `modularAV.stylesheets`, published path → its parts in order, paths in
 * the package, e.g. `"theme.css": ["styles/base.css", "styles/tile.css"]`.
 * The build joins them into `dist/`, and the test harness joins them on
 * each request, so an edit shows on the next load. Relative `url()`s in a
 * part are read from the published file's folder, as if it were one file.
 * Published path → absolute part files.
 */
export type StylesheetMap = ReadonlyMap<string, readonly string[]>;

const isStylesheet = (path: string): boolean =>
  isSafePath(path) && path.endsWith(".css");

const isPartList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((part) => typeof part === "string");

function readOption(
  packageDir: string,
): Readonly<Record<string, readonly string[]>> {
  const pkg = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  ) as { modularAV?: { stylesheets?: unknown } };
  const sheets = pkg.modularAV?.stylesheets;
  if (sheets === undefined) return {};
  const valid =
    typeof sheets === "object" &&
    sheets !== null &&
    !Array.isArray(sheets) &&
    Object.values(sheets).every(isPartList);
  if (!valid)
    throw new Error(
      `${packageDir}: modularAV.stylesheets must map published paths to lists of .css parts`,
    );
  return sheets as Readonly<Record<string, readonly string[]>>;
}

function partFile(packageDir: string, part: string): string {
  if (!isStylesheet(part))
    throw new Error(`${packageDir}: unsafe part ${JSON.stringify(part)}`);
  const file = join(packageDir, part);
  if (!existsSync(file))
    throw new Error(`${packageDir}: no stylesheet part ${part}`);
  return file;
}

export function readStylesheets(packageDir: string): StylesheetMap {
  const entries = Object.entries(readOption(packageDir)).map(
    ([path, parts]) => {
      if (!isStylesheet(path))
        throw new Error(
          `${packageDir}: unsafe published path ${JSON.stringify(path)}`,
        );
      return [path, parts.map((part) => partFile(packageDir, part))] as const;
    },
  );
  return new Map(entries);
}

/** The parts as one stylesheet: in order, a blank line between them. */
export const joinStylesheet = (parts: readonly string[]): string =>
  `${parts.map((part) => readFileSync(part, "utf8").trimEnd()).join("\n\n")}\n`;
