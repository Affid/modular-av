// Checks the running test world: each user joins, the core module is active
// with its API, and no errors reach the console. Screenshots go to
// test-results/foundry/. Pass --chrome to use Windows Chrome over CDP.
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import { listModulePackages, ROOT } from "../../tools/workspace.ts";
import { loadFoundryEnv } from "./env.ts";
import { joinAs } from "./session.ts";

const USERS = ["Gamemaster", "Player1"] as const;
const CORE_ID = "modular-av";
const OUT = join(ROOT, "test-results", "foundry");

interface ModuleState {
  readonly id: string;
  readonly active: boolean;
  readonly apiVersion: unknown;
  readonly apiFrozen: boolean;
}

async function readModuleState(
  page: Page,
  ids: readonly string[],
): Promise<readonly ModuleState[]> {
  return page.evaluate((wanted) => {
    const g = globalThis as unknown as {
      game: {
        modules: {
          get(
            id: string,
          ): { active: boolean; api?: { version?: unknown } } | undefined;
        };
      };
    };
    return wanted.map((id) => {
      const mod = g.game.modules.get(id);
      return {
        id,
        active: mod?.active ?? false,
        apiVersion: mod?.api?.version,
        apiFrozen: mod?.api ? Object.isFrozen(mod.api) : false,
      };
    });
  }, ids);
}

async function checkUser(
  browser: Browser,
  url: string,
  user: string,
): Promise<readonly string[]> {
  const page = await joinAs(browser, url, user);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
  await page.reload();
  await page.waitForFunction(
    () => (globalThis as { game?: { ready?: boolean } }).game?.ready === true,
  );

  const modules = await listModulePackages();
  const problems = [...errors];
  for (const state of await readModuleState(
    page,
    modules.map((m) => m.id),
  )) {
    const built = JSON.parse(
      await readFile(
        join(
          modules.find((m) => m.id === state.id)?.dir ?? "",
          "dist",
          "module.json",
        ),
        "utf8",
      ),
    ) as { version: string };
    if (!state.active) problems.push(`${state.id} is not active`);
    // Only the core must have an API; a module that has one must keep it
    // versioned and frozen.
    const hasApi = state.apiVersion !== undefined;
    if (!hasApi && state.id !== CORE_ID) continue;
    if (state.apiVersion !== built.version)
      problems.push(`${state.id} api version ${String(state.apiVersion)}`);
    if (!state.apiFrozen) problems.push(`${state.id} api is not frozen`);
  }
  await page.screenshot({ path: join(OUT, `${user}.png`) });
  await page.context().close();
  return problems;
}

const env = loadFoundryEnv();
const useChrome = process.argv.includes("--chrome");
await mkdir(OUT, { recursive: true });
const browser = useChrome
  ? await chromium.connectOverCDP(env.chromeCdpUrl)
  : await chromium.launch();
try {
  let failed = false;
  for (const user of USERS) {
    const problems = await checkUser(browser, env.url, user);
    failed ||= problems.length > 0;
    console.log(
      problems.length === 0
        ? `${user}: ok`
        : `${user}: FAIL\n  ${problems.join("\n  ")}`,
    );
  }
  console.log(`Screenshots: ${OUT}`);
  process.exitCode = failed ? 1 : 0;
} finally {
  // Over CDP this only disconnects: the user's Chrome stays open.
  await browser.close();
}
