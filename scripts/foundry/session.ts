// Logging users into the running world and acting inside Foundry's client.
import type { Browser, Page } from "@playwright/test";

const READY_TIMEOUT_MS = 60_000;

export interface WorldUser {
  readonly name: string;
  /** Foundry's CONST.USER_ROLES value. */
  readonly role: number;
}

/** Opens a cookie-isolated context and joins the world as `userName`. */
export async function joinAs(
  browser: Browser,
  url: string,
  userName: string,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(`${url}/join`);
  await page
    .locator('#join-game-form select[name="userId"]')
    .selectOption({ label: userName });
  await page.locator('#join-game-form button[name="join"]').click();
  await page.waitForURL(/\/game$/, { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    () => (globalThis as { game?: { ready?: boolean } }).game?.ready === true,
    null,
    {
      timeout: READY_TIMEOUT_MS,
    },
  );
  return page;
}

/** Creates missing users and sets the role of existing ones. Needs a GM page. */
export async function ensureUsers(
  page: Page,
  users: readonly WorldUser[],
): Promise<readonly string[]> {
  return page.evaluate(async (wanted) => {
    interface UserDoc {
      name: string;
      role: number;
      update(data: object): Promise<unknown>;
    }
    const g = globalThis as unknown as {
      game: { users: { getName(name: string): UserDoc | undefined } };
      User: { createDocuments(data: object[]): Promise<unknown> };
    };
    const missing = wanted.filter((u) => !g.game.users.getName(u.name));
    const wrongRole = wanted.flatMap((u) => {
      const doc = g.game.users.getName(u.name);
      return doc && doc.role !== u.role ? [{ doc, role: u.role }] : [];
    });
    if (missing.length > 0)
      await g.User.createDocuments(
        missing.map((u) => ({ ...u, password: "" })),
      );
    await Promise.all(wrongRole.map(({ doc, role }) => doc.update({ role })));
    return [
      ...missing.map((u) => `created ${u.name}`),
      ...wrongRole.map((w) => `set role of ${w.doc.name}`),
    ];
  }, users);
}

/** Enables modules in the world; returns true when Foundry needs a reload. */
export async function enableModules(
  page: Page,
  ids: readonly string[],
): Promise<boolean> {
  return page.evaluate(async (wanted) => {
    const g = globalThis as unknown as {
      game: {
        settings: {
          get(ns: string, key: string): Record<string, boolean>;
          set(ns: string, key: string, value: object): Promise<unknown>;
        };
      };
    };
    const current = g.game.settings.get("core", "moduleConfiguration");
    if (wanted.every((id) => current[id] === true)) return false;
    await g.game.settings.set("core", "moduleConfiguration", {
      ...current,
      ...Object.fromEntries(wanted.map((id) => [id, true])),
    });
    return true;
  }, ids);
}

export async function reloadWorld(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(
    () => (globalThis as { game?: { ready?: boolean } }).game?.ready === true,
    null,
    {
      timeout: READY_TIMEOUT_MS,
    },
  );
}
