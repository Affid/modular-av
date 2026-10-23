import { relative } from "node:path";
import { ROOT, listModulePackages } from "../workspace.ts";
import { checkModuleLanguages } from "./check.ts";

const modules = await listModulePackages();
const results = await Promise.all(
  modules.map(async (mod) => ({
    mod,
    issues: await checkModuleLanguages(mod.dir),
  })),
);

for (const { mod, issues } of results) {
  for (const issue of issues) {
    const where = issue.path ? ` ${issue.path}` : "";
    console.error(
      `${relative(ROOT, mod.dir)}/${issue.file}:${where} ${issue.message}`,
    );
  }
}

const total = results.reduce((sum, r) => sum + r.issues.length, 0);
console.log(
  `Language files: ${String(modules.length)} module(s) checked, ${String(total)} issue(s).`,
);
process.exitCode = total > 0 ? 1 : 0;
