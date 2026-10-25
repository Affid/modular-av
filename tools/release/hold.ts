import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Why a module must not be released yet (`modularAV.releaseHold` in its
 * package.json, e.g. waiting for a third party's permission), or null.
 */
export async function releaseHold(dir: string): Promise<string | null> {
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
    modularAV?: { releaseHold?: unknown };
  };
  const hold = pkg.modularAV?.releaseHold;
  return typeof hold === "string" && hold.trim() !== "" ? hold : null;
}
