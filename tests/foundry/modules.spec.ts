// The core's modules window in Foundry: a GM opens it from the module
// settings, sees what the world runs on the board, plans a change and
// gets the links; the window passes axe's WCAG 2.1 AA checks.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { configureWorld, openGm, type Player } from "./world.ts";

test.describe.configure({ mode: "serial" });

const AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

let open: Player[] = [];

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "dock");
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test("a GM plans the world's modules on the board", async ({ browser }) => {
  const gm = await openGm(browser);
  open = [gm];
  await gm.run(async (_api, game) => {
    await game.settings.set("modular-av", "modulesPlan", null);
  }, null);

  // Configure Settings, Modular A/V, "Plan your modules".
  await gm.page.locator('#sidebar-tabs [data-tab="settings"]').click();
  await gm.page.locator('button[data-app="configure"]').click();
  await gm.page
    .locator('#settings-config [data-tab="modular-av"]')
    .first()
    .click();
  await gm.page.getByRole("button", { name: "Plan your modules" }).click();

  const window = gm.page.locator("#modular-av-modules");
  const board = window.locator(".mav-board-plan");
  await expect(board).toBeVisible();
  await expect(window.locator(".mav-board-status")).toContainText(
    "This world runs",
  );
  await expect(board).toContainText("LiveKit");
  await expect(board).toContainText("Dock");
  await expect(window.locator(".mav-board-source")).toContainText(
    "this version of Modular A/V knows",
  );

  // Removing the Dock plans to turn it off, with the theme hanging off it.
  await window.getByRole("button", { name: "Remove Dock" }).click();
  await expect(window.locator(".mav-board-status")).toContainText("Your plan:");
  await expect(window.locator(".mav-board-steps")).toContainText("turn off");

  // A piece dragged from the tray onto its socket goes on the board.
  await window
    .getByRole("button", { name: "Remove Noise cancellation" })
    .click();
  await window
    .locator(".mav-board-tray .mav-board-piece", {
      hasText: "Noise cancellation",
    })
    .dragTo(window.locator('[data-socket="core.effects"]'));
  await expect(
    window.locator(".mav-board-arm.effects .mav-board-piece", {
      hasText: "Noise cancellation",
    }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page: gm.page })
    .include("#modular-av-modules")
    .withTags(AA)
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
  const content = window.locator(".window-content");
  await content.evaluate((c) => {
    c.scrollTop = 0;
  });
  await gm.page.screenshot({ path: "test-results/foundry/modules-board.png" });
  await content.evaluate((c) => {
    c.scrollTop = c.scrollHeight;
  });
  await gm.page.screenshot({ path: "test-results/foundry/modules-steps.png" });

  // The plan stays in the world, for when the GM comes back.
  const saved = await gm.run(
    (_api, game) => game.settings.get("modular-av", "modulesPlan"),
    null,
  );
  expect(saved).toMatchObject({ trip: null });
  await gm.run(async (_api, game) => {
    await game.settings.set("modular-av", "modulesPlan", null);
  }, null);
});

test("a GM reaches it from the Voice & Video Settings window too", async ({
  browser,
}) => {
  const gm = await openGm(browser);
  open = [gm];
  await expect(gm.page.locator("#camera-views .mav-dock")).toBeVisible();

  await gm.page.locator(".mav-dock-settings").click();
  await gm.page
    .locator("#modular-av-settings")
    .getByRole("button", { name: "Plan your modules" })
    .click();

  await expect(
    gm.page.locator("#modular-av-modules .mav-board-plan"),
  ).toBeVisible();
});
