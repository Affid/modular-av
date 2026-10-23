import { listModulePackages } from "../workspace.ts";
import { checkEntrySize } from "./check.ts";

const results = await Promise.all(
  (await listModulePackages()).map(checkEntrySize),
);

for (const r of results) {
  const size = r.bytes === undefined ? "?" : String(r.bytes);
  const budget = r.budget === undefined ? "?" : String(r.budget);
  const line = `${r.id}: ${size} / ${budget} bytes`;
  if (r.problem) console.error(`${line}  FAIL: ${r.problem}`);
  else console.log(`${line}  ok`);
}

process.exitCode = results.some((r) => r.problem) ? 1 : 0;
