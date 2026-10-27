/**
 * The theme contract for `modular-av-dock` (handoff §3 "Rules for
 * themes"): what every theme keeps, checked automatically in every layout
 * and state, since screenshot baselines exist only for the dock's own
 * look. A theme module runs it from a Playwright spec:
 *
 * - WCAG AA (axe) for the dock and its popovers, and 3:1 for indicators
 *   against the tile they sit on;
 * - every state's indicator visible, and not drawn over by the frame;
 * - faces clear: inside a margin of the video the frame draws nothing,
 *   and no video shape cuts it;
 * - frames take no clicks;
 * - nothing animated under `prefers-reduced-motion`.
 */
import AxeBuilder from "@axe-core/playwright";
import type { ModularAV } from "@modular-av/api";
import { expect, type Locator, type Page, test } from "@playwright/test";
import type {} from "../harness/types.ts";

/** How much of each side of the video a frame may cover. */
export const MAX_FRAME_COVER = 0.15;

export interface ThemeDriver {
  /** The harness's ?module=, e.g. "dock,dock-vines". */
  readonly modules: string;
  /** The theme's id; "default" for the dock's own look. */
  readonly theme: string;
  /** The placements to check, by their names in the placement menu. */
  readonly layouts: readonly string[];
}

const AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Hides what moves (videos, meters), so screenshots compare. */
const STILL = `video, .mav-meter { visibility: hidden !important; }`;
const NO_FRAME = `.mav-dock-tile-frame { visibility: hidden !important; }
.mav-dock-tile-media, .mav-dock-tile-video { clip-path: none !important; mask: none !important; }`;

/**
 * A call in every state at once: p1 speaking, muted, deafened and on a
 * poor link, p2 blocked by the GM and hidden by this player.
 */
async function call(
  page: Page,
  driver: ThemeDriver,
  layout: string,
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    `/?module=${driver.modules}&service=mock&sample=1&players=p1,p2&theme=${driver.theme}`,
  );
  await page.waitForFunction(() => window.harness !== undefined);
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
    h?.ui?.hub.setQuality("gm1", "p1", "poor");
    await gm.commands.setBroadcastPermissions("p2", {
      audio: false,
      video: false,
    });
    await gm.commands.setHiddenByMe("p2", true);
  });
  await expect(page.locator('[data-participant-id="p2"]')).toHaveAttribute(
    "data-blocked-audio",
    "",
  );
  await page.addStyleTag({ content: STILL });
  await page.locator(".mav-dock-placement").click();
  await page.getByRole("menuitemradio", { name: layout }).click();
  await expect(
    page.locator('.mav-dock-tile[data-participant-id="p1"]'),
  ).toBeVisible();
}

/** Two screenshots of the same box, with the frame and without it. */
async function withAndWithoutFrame(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
) {
  const clip = {
    x: Math.ceil(box.x),
    y: Math.ceil(box.y),
    width: Math.max(1, Math.floor(box.width)),
    height: Math.max(1, Math.floor(box.height)),
  };
  const framed = await page.screenshot({ clip, animations: "disabled" });
  const style = await page.addStyleTag({ content: NO_FRAME });
  const bare = await page.screenshot({ clip, animations: "disabled" });
  await style.evaluate((el) => {
    (el as Element).remove();
  });
  return { framed, bare };
}

async function boxOf(target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("not on screen");
  return box;
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

/** Each indicator's contrast against the tile it sits on (its background blended). */
function indicatorContrasts(
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
    return Array.from(
      document.querySelectorAll<HTMLElement>(".mav-dock-tile .mav-indicator"),
    ).map((el) => {
      const tile = el.closest(".mav-dock-tile");
      const under = tile
        ? parse(getComputedStyle(tile).backgroundColor)
        : [0, 0, 0];
      const [r = 0, g = 0, b = 0, a = 1] = parse(
        getComputedStyle(el).backgroundColor,
      );
      const bg = [r, g, b].map((v, i) => v * a + (under[i] ?? 0) * (1 - a));
      const [hi, lo] = [lum(parse(getComputedStyle(el).color)), lum(bg)].sort(
        (x, y) => y - x,
      );
      return {
        name: el.dataset.indicator ?? el.dataset.contribution ?? "",
        ratio: ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05),
      };
    });
  });
}

function accessibilityTests(driver: ThemeDriver, layout: string): void {
  test("meets WCAG AA: the dock, its popovers and the settings window", async ({
    page,
  }) => {
    await call(page, driver, layout);

    await expectAA(page, ".mav-dock");
    const tile = page.locator('.mav-dock-tile[data-participant-id="p1"]');
    await tile.hover();
    await tile.locator(".mav-dock-tile-menu").click();
    await expectAA(page, ".mav-popover");
    await page.keyboard.press("Escape");
    await page.locator(".mav-dock-quick").click();
    await expectAA(page, ".mav-popover");
    await page.keyboard.press("Escape");
    await page.locator(".mav-dock-settings").click();
    await expect(page.locator(".mav-settings")).toBeVisible();
    await expectAA(page, ".mav-settings");
  });

  test("indicators keep 3:1 against the tile they sit on", async ({ page }) => {
    await call(page, driver, layout);

    const ratios = await indicatorContrasts(page);

    expect(ratios.length).toBeGreaterThan(4);
    for (const { name, ratio } of ratios)
      expect(ratio, `${name} contrast`).toBeGreaterThanOrEqual(3);
  });
}

function frameTests(driver: ThemeDriver, layout: string): void {
  test("shows every state's indicator, never drawn over by the frame", async ({
    page,
  }) => {
    await call(page, driver, layout);
    const names = [
      "muted",
      "deafened",
      "blocked-audio",
      "blocked-video",
      "hidden-by-me",
      "connection",
    ];

    for (const name of names) {
      const indicator = page
        .locator(`.mav-dock-tile [data-indicator="${name}"]`)
        .first();
      await expect(indicator, name).toBeVisible();
      const { framed, bare } = await withAndWithoutFrame(
        page,
        await boxOf(indicator),
      );
      expect(framed.equals(bare), `the frame draws over ${name}`).toBe(true);
    }
  });

  test("leaves faces clear: the frame stays in a margin of the video", async ({
    page,
  }) => {
    await call(page, driver, layout);

    for (const media of await page.locator(".mav-dock-tile-media").all()) {
      const box = await boxOf(media);
      const face = {
        x: box.x + box.width * MAX_FRAME_COVER,
        y: box.y + box.height * MAX_FRAME_COVER,
        width: box.width * (1 - 2 * MAX_FRAME_COVER),
        height: box.height * (1 - 2 * MAX_FRAME_COVER),
      };
      // The bar and buttons are the dock's, not the frame's: leave them out.
      await page.addStyleTag({
        content:
          ".mav-dock-tile-bar, .mav-dock-tile > button { visibility: hidden !important; }",
      });
      const { framed, bare } = await withAndWithoutFrame(page, face);
      expect(framed.equals(bare), "the frame covers the face").toBe(true);
    }
  });

  test("frames take no clicks", async ({ page }) => {
    await call(page, driver, layout);

    const events = await page
      .locator(".mav-dock-tile-frame")
      .evaluateAll((frames) =>
        frames.flatMap((f) =>
          [null, "::before", "::after"].map(
            (pseudo) => getComputedStyle(f, pseudo).pointerEvents,
          ),
        ),
      );

    expect(new Set(events)).toEqual(new Set(["none"]));
  });

  test("animates nothing under prefers-reduced-motion", async ({ page }) => {
    await call(page, driver, layout);

    await page.evaluate(() => {
      window.harness?.ui?.hub.setSpeaking("p1", false);
      window.harness?.ui?.hub.setSpeaking("p2", true);
    });
    await expect(page.locator('[data-participant-id="p2"]')).toHaveAttribute(
      "data-speaking",
      "",
    );

    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    );
    expect(running).toBe(0);
  });
}

/** Every check of the theme contract, in each layout the driver names. */
export function themeContract(driver: ThemeDriver): void {
  test.describe(`theme contract: ${driver.theme}`, () => {
    test.use({ viewport: { width: 1280, height: 720 } });
    test.describe.configure({ mode: "parallel" });
    for (const layout of driver.layouts)
      test.describe(layout, () => {
        accessibilityTests(driver, layout);
        frameTests(driver, layout);
      });
  });
}
