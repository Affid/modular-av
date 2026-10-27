// The dock's default theme: WCAG AA (axe), contrast of what axe can't
// check (icons, focus rings), and screenshot baselines for the default
// theme only. Videos and meters move, so screenshots mask them.
import AxeBuilder from "@axe-core/playwright";
import type { ModularAV } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page, test } from "@playwright/test";

const AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.use({ viewport: { width: 1280, height: 720 } });

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

async function expectAA(page: Page, selector: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(AA)
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

/** Contrast of `fg` over `bg` after blending a translucent background. */
async function iconContrasts(
  page: Page,
): Promise<readonly { name: string; ratio: number }[]> {
  return page.evaluate(() => {
    const parse = (c: string): number[] =>
      (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r = 0, g = 0, b = 0]: number[]): number => {
      const ch = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const tile = [17, 18, 20];
    return Array.from(
      document.querySelectorAll<HTMLElement>(".mav-indicator"),
    ).map((el) => {
      const style = getComputedStyle(el);
      const [r = 0, g = 0, b = 0, a = 1] = parse(style.backgroundColor);
      const bg = [r, g, b].map((v, i) => v * a + (tile[i] ?? 0) * (1 - a));
      const fg = parse(style.color);
      const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return {
        name: el.dataset.indicator ?? el.dataset.contribution ?? "",
        ratio: ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05),
      };
    });
  });
}

test("the dock meets WCAG AA in every state of the call", async ({ page }) => {
  await call(page);

  await expectAA(page, ".mav-dock");
});

test("indicators keep at least 3:1 against what they sit on", async ({
  page,
}) => {
  await call(page);

  const ratios = await iconContrasts(page);

  expect(ratios.length).toBeGreaterThan(3);
  for (const { name, ratio } of ratios)
    expect(ratio, `${name} contrast`).toBeGreaterThanOrEqual(3);
});

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

test("the participant menu, quick controls and settings window meet WCAG AA", async ({
  page,
}) => {
  await call(page);

  await page.locator('[data-participant-id="p1"]').hover();
  await page.locator('[data-participant-id="p1"] .mav-dock-tile-menu').click();
  await expectAA(page, ".mav-popover");
  await page.keyboard.press("Escape");
  await page.locator(".mav-dock-quick").click();
  await expectAA(page, ".mav-popover");
  await page.keyboard.press("Escape");
  await page.locator(".mav-dock-settings").click();
  await expect(page.locator(".mav-settings")).toBeVisible();
  await expectAA(page, ".mav-settings");
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
