import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ModulePackage } from "../workspace.ts";

/**
 * Each module's entry chunk has a byte budget (`modularAV.entryBudgetBytes`
 * in its package.json). Service SDKs and effect code load lazily in
 * `create()`, so a module that imports them eagerly blows its budget here.
 */
export interface SizeResult {
  readonly id: string;
  readonly bytes: number | undefined;
  readonly budget: number | undefined;
  readonly problem: string | undefined;
}

async function readBudget(dir: string): Promise<number | undefined> {
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
    modularAV?: { entryBudgetBytes?: unknown };
  };
  const budget = pkg.modularAV?.entryBudgetBytes;
  return typeof budget === "number" && budget > 0 ? budget : undefined;
}

export async function checkEntrySize(mod: ModulePackage): Promise<SizeResult> {
  const budget = await readBudget(mod.dir);
  const entry = `dist/${mod.id}.js`;
  const bytes = await stat(join(mod.dir, entry)).then(
    (s) => s.size,
    () => undefined,
  );
  const problem =
    budget === undefined
      ? "package.json has no modularAV.entryBudgetBytes"
      : bytes === undefined
        ? `${entry} not found: build first`
        : bytes > budget
          ? `entry is ${String(bytes)} bytes, over its budget of ${String(budget)}`
          : undefined;
  return { id: mod.id, bytes, budget, problem };
}
