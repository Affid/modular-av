// The dock's default theme: the theme contract, focus rings, and
// screenshot baselines (for the default theme only). Videos and meters
// move, so screenshots mask them.
import type { ModularAV } from "@modular-av/api";
import { themeContract } from "@modular-av/testing/contract/theme";
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 720 } });

// WCAG AA, indicators, faces, clicks and motion: what every theme keeps.
themeContract({
  modules: "dock",
  theme: "default",
  layouts: ["Docked on the left", "Floating", "Scattered over the screen"],
});

/** A call with p1 speaking, muted and deafened, and p2 blocked by the GM. */
async function call(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?module=dock&service=mock&sample=1&players=p1,p2");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-status")).toHaveAttribute(
    "data-status",
    "connected",
    { timeout: 20_000 },
  );
  await expect(page.locator(".mav-dock-tile")).toHaveCount(3, {
    timeout: 20_000,
  });
  await page.evaluate(async () => {
    const h = window.harness;
    const gm = h?.client.game.modules.get("modular-av")?.api as ModularAV;
    const p1 = h?.ui?.players.p1;
    await p1?.commands.setMuted(true);
    await p1?.commands.setDeafened(true);
    h?.ui?.hub.setSpeaking("p1", true);
    await gm.commands.setBroadcastPermissions("p2", {
      audio: false,
      video: false,
    });
  });
  await expect(page.locator('[data-participant-id="p2"]')).toHaveAttribute(
    "data-blocked-audio",
    "",
  );
  await expect(page.locator('[data-participant-id="p1"]')).toHaveAttribute(
    "data-muted",
    "",
  );
  await stillVideos(page);
}

const moving = (page: Page): Locator[] => [page.locator(".mav-meter")];

/** Fake cameras move: screenshots show the tiles without their video. */
async function stillVideos(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "video { visibility: hidden !important; }",
  });
}

test("buttons the dock hides aren't shown", async ({ page }) => {
  await call(page);

  // Docked and connected: no moving, nothing to reconnect.
  await expect(page.locator(".mav-dock-move")).toBeHidden();
  await expect(page.locator(".mav-dock-action")).toBeHidden();
  await expect(page.locator(".mav-dock-leave")).toBeVisible();
});

test("a focused control shows a visible focus ring", async ({ page }) => {
  await call(page);

  await page.locator(".mav-dock-mute").focus();
  await page.keyboard.press("ArrowRight");
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  });

  expect(ring.style).toBe("solid");
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

test.describe("screenshots of the default theme", () => {
  test("docked on the left", async ({ page }) => {
    await call(page);

    await expect(page.locator(".mav-dock")).toHaveScreenshot("dock-left.png", {
      mask: moving(page),
    });
  });

  test("docked at the top", async ({ page }) => {
    await call(page);
    await page.locator(".mav-dock-placement").click();
    await page
      .getByRole("menuitemradio", { name: "Docked at the top" })
      .click();
    // Off the dock: a tile under the pointer would show its menu button.
    await page.mouse.move(640, 600);

    await expect(page.locator(".mav-dock")).toHaveScreenshot("dock-top.png", {
      mask: moving(page),
    });
  });

  test("floating", async ({ page }) => {
    await call(page);
    await page.locator(".mav-dock-placement").click();
    await page.getByRole("menuitemradio", { name: "Floating" }).click();

    await expect(page).toHaveScreenshot("dock-floating.png", {
      mask: moving(page),
    });
  });

  test("reconnecting", async ({ page }) => {
    await call(page);
    await page.evaluate(() => {
      window.harness?.ui?.hub.loseConnection("gm1");
    });
    await expect(page.locator(".mav-dock-status")).toHaveAttribute(
      "data-status",
      "reconnecting",
    );

    await expect(page.locator(".mav-dock-panel")).toHaveScreenshot(
      "panel-reconnecting.png",
      {
        mask: [...moving(page), page.locator(".mav-dock-status")],
      },
    );
  });

  test("a participant's menu", async ({ page }) => {
    await call(page);
    await page.locator('[data-participant-id="p1"]').hover();
    await page
      .locator('[data-participant-id="p1"] .mav-dock-tile-menu')
      .click();

    await expect(page.locator(".mav-popover")).toHaveScreenshot("menu.png", {
      mask: moving(page),
    });
  });

  test("the settings window", async ({ page }) => {
    await call(page);
    await page.locator(".mav-dock-settings").click();

    await expect(page.locator(".mav-settings")).toHaveScreenshot(
      "settings.png",
      {
        mask: moving(page),
      },
    );
  });
});
