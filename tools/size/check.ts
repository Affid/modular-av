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

type BudgetKey = "entryBudgetBytes" | "styleBudgetBytes";

async function readBudget(
  dir: string,
  key: BudgetKey = "entryBudgetBytes",
): Promise<number | undefined> {
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
    modularAV?: Partial<Record<BudgetKey, unknown>>;
  };
  const budget = pkg.modularAV?.[key];
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

/**
 * A UI module's stylesheet (`dist/<id>.css`) has a budget too
 * (`modularAV.styleBudgetBytes`): every page loads it. Undefined for a
 * module without styles.
 */
export async function checkStyleSize(
  mod: ModulePackage,
): Promise<SizeResult | undefined> {
  const file = `dist/${mod.id}.css`;
  const bytes = await stat(join(mod.dir, file)).then(
    (s) => s.size,
    () => undefined,
  );
  if (bytes === undefined) return undefined;
  const budget = await readBudget(mod.dir, "styleBudgetBytes");
  const problem =
    budget === undefined
      ? "package.json has no modularAV.styleBudgetBytes"
      : bytes > budget
        ? `styles are ${String(bytes)} bytes, over their budget of ${String(budget)}`
        : undefined;
  return { id: `${mod.id}.css`, bytes, budget, problem };
}
