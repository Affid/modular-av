import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readWorkers } from "../assets/workers.ts";
import type { ModulePackage } from "../workspace.ts";

/**
 * Each module's entry chunk has a byte budget (`modularAV.entryBudgetBytes`
 * in its package.json), counted with the chunks it imports when it loads.
 * Service SDKs and effect code load lazily in `create()`, so a module that
 * imports them eagerly blows its budget here. Worker scripts have one too
 * (`modularAV.workerBudgetBytes`).
 */
export interface SizeResult {
  readonly id: string;
  readonly bytes: number | undefined;
  readonly budget: number | undefined;
  readonly problem: string | undefined;
}

type BudgetKey = "entryBudgetBytes" | "styleBudgetBytes" | "workerBudgetBytes";

/** `import … from "./x.js"`, `import "./x.js"`, `export … from "./x.js"`. */
const STATIC_IMPORT = /^\s*(?:import|export)\b[^;'"()]*?["'](\.\/[^"']+)["']/gm;

/**
 * The bytes of a chunk and every chunk it imports statically, each once;
 * dynamic `import()` isn't followed. Undefined if the chunk isn't there.
 */
async function loadedBytes(file: string): Promise<number | undefined> {
  const seen = new Set<string>();
  const visit = async (path: string): Promise<number | undefined> => {
    if (seen.has(path)) return 0;
    seen.add(path);
    const text = await readFile(path, "utf8").catch(() => undefined);
    if (text === undefined) return undefined;
    const imports = [...text.matchAll(STATIC_IMPORT)].map((m) =>
      join(dirname(path), m[1] ?? ""),
    );
    let total = Buffer.byteLength(text);
    for (const imported of imports) total += (await visit(imported)) ?? 0;
    return total;
  };
  return visit(file);
}

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
  const bytes = await loadedBytes(join(mod.dir, entry));
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

/** Each worker script with the chunks it imports, against the workers' budget. */
export async function checkWorkerSizes(
  mod: ModulePackage,
): Promise<readonly SizeResult[]> {
  const workers = readWorkers(mod.dir);
  if (workers.length === 0) return [];
  const budget = await readBudget(mod.dir, "workerBudgetBytes");
  return Promise.all(
    workers.map(async (worker) => {
      const file = `dist/${worker.path}`;
      const bytes = await loadedBytes(join(mod.dir, file));
      const problem =
        budget === undefined
          ? "package.json has no modularAV.workerBudgetBytes"
          : bytes === undefined
            ? `${file} not found: build first`
            : bytes > budget
              ? `worker is ${String(bytes)} bytes, over its budget of ${String(budget)}`
              : undefined;
      return { id: `${mod.id}/${worker.path}`, bytes, budget, problem };
    }),
  );
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
