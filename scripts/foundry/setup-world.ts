// Prepares the local Foundry for testing, safe to run again at any time:
// administrator password, game system, test world, users, enabled modules.
// Run `pnpm build && pnpm foundry:link` first so the modules are installed.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { listModulePackages } from "../../tools/workspace.ts";
import {
  createAdminClient,
  createWorld,
  findPackage,
  hasActiveWorld,
  installPackage,
  launchWorld,
  loginAsAdmin,
} from "./admin.ts";
import { loadFoundryEnv } from "./env.ts";
import {
  enableModules,
  ensureUsers,
  joinAs,
  reloadWorld,
  type WorldUser,
} from "./session.ts";

export const TEST_WORLD = {
  id: "modular-av-test",
  title: "Modular A/V test",
  system: "dnd5e",
} as const;

const TRUSTED = 2;
const PLAYER = 1;
const GAMEMASTER = 4;

/** Player1-3 may broadcast (Trusted); Player4 may not, to test that state. */
export const TEST_USERS: readonly WorldUser[] = [
  { name: "Gamemaster", role: GAMEMASTER },
  { name: "Gamemaster2", role: GAMEMASTER },
  { name: "Player1", role: TRUSTED },
  { name: "Player2", role: TRUSTED },
  { name: "Player3", role: TRUSTED },
  { name: "Player4", role: PLAYER },
];

const env = loadFoundryEnv();
const data = join(env.dataDir, "Data");
const api = await createAdminClient(env.url);

if (await hasActiveWorld(api)) {
  console.log("A world is already running; skipping server setup.");
} else {
  const login = await loginAsAdmin(
    api,
    env.adminPassword,
    join(env.dataDir, "Config"),
  );
  if (login === "password-set-restart-needed") {
    console.log(
      "Administrator password set. Restart Foundry (pnpm foundry:start), then run this again.",
    );
    process.exit(2);
  }
  console.log("Administrator: logged in");
  const systemFile = join(data, "systems", TEST_WORLD.system, "system.json");
  if (!existsSync(systemFile)) {
    console.log(`System ${TEST_WORLD.system}: installing`);
    await installPackage(
      api,
      await findPackage(api, "system", TEST_WORLD.system),
      "system",
      systemFile,
    );
  }
  const worldFile = join(data, "worlds", TEST_WORLD.id, "world.json");
  if (!existsSync(worldFile)) {
    console.log(`World ${TEST_WORLD.id}: creating`);
    await createWorld(api, TEST_WORLD, worldFile);
  }
  console.log(`World ${TEST_WORLD.id}: launching`);
  await launchWorld(api, TEST_WORLD.id);
}
await api.dispose();

const browser = await chromium.launch();
try {
  const gm = await joinAs(browser, env.url, "Gamemaster");
  for (const change of await ensureUsers(gm, TEST_USERS))
    console.log(`Users: ${change}`);
  const moduleIds = (await listModulePackages()).map((m) => m.id);
  if (await enableModules(gm, moduleIds)) {
    console.log(`Modules: enabled ${moduleIds.join(", ")}`);
    await reloadWorld(gm);
  }
  // Tests never ask GitHub for the family's catalog; a spec turns it on.
  await gm.evaluate(async () => {
    const g = globalThis as unknown as {
      game: {
        settings: {
          set(ns: string, key: string, value: unknown): Promise<unknown>;
        };
      };
    };
    await g.game.settings.set("modular-av", "checkGitHub", false);
  });
  console.log("Test world ready.");
} finally {
  await browser.close();
}
