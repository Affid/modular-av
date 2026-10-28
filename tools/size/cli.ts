import { listModulePackages } from "../workspace.ts";
import {
  checkEntrySize,
  checkStyleSizes,
  checkWorkerSizes,
  hasScript,
} from "./check.ts";

const modules = await listModulePackages();
const scripted = (
  await Promise.all(modules.map(async (m) => ((await hasScript(m)) ? [m] : [])))
).flat();
const results = [
  ...(await Promise.all(scripted.map(checkEntrySize))),
  ...(await Promise.all(modules.map(checkStyleSizes))).flat(),
  ...(await Promise.all(modules.map(checkWorkerSizes))).flat(),
];

for (const r of results) {
  const size = r.bytes === undefined ? "?" : String(r.bytes);
  const budget = r.budget === undefined ? "?" : String(r.budget);
  const line = `${r.id}: ${size} / ${budget} bytes`;
  if (r.problem) console.error(`${line}  FAIL: ${r.problem}`);
  else console.log(`${line}  ok`);
}

process.exitCode = results.some((r) => r.problem) ? 1 : 0;
