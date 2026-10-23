// Links every built module's dist/ into Foundry's Data/modules/<id>.
import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { join } from "node:path";
import { listModulePackages } from "../../tools/workspace.ts";
import { loadFoundryEnv } from "./env.ts";

const modulesDir = join(loadFoundryEnv().dataDir, "Data", "modules");
await mkdir(modulesDir, { recursive: true });

for (const mod of await listModulePackages()) {
  const target = join(mod.dir, "dist");
  const link = join(modulesDir, mod.id);
  const existing = await lstat(link).catch(() => undefined);
  if (existing?.isSymbolicLink() && (await readlink(link)) === target) {
    console.log(`${mod.id}: already linked`);
  } else if (existing) {
    console.error(
      `${mod.id}: ${link} exists and is not our link; leaving it alone`,
    );
    process.exitCode = 1;
  } else {
    await symlink(target, link, "dir");
    console.log(`${mod.id}: linked ${link} -> ${target}`);
  }
}
