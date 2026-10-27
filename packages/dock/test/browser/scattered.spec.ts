// The scattered layout in a real browser: where tiles go, how they move,
// and that Foundry's controls stay clear. The harness has none of
// Foundry's interface, so the tests add stand-ins with Foundry's ids.
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 720 } });

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const SIDEBAR = { x: 980, y: 0, width: 300, height: 720 };
const HOTBAR = { x: 400, y: 660, width: 480, height: 60 };

/** Foundry's sidebar and hotbar, as fixed boxes with their ids. */
async function addControls(page: Page): Promise<void> {
  await page.evaluate(
    ([sidebar, hotbar]) => {
      for (const [id, box] of [
        ["sidebar", sidebar],
        ["hotbar", hotbar],
      ] as const) {
        const el = document.createElement("aside");
        el.id = id;
        Object.assign(el.style, {
          position: "fixed",
          left: `${String(box.x)}px`,
          top: `${String(box.y)}px`,
          width: `${String(box.width)}px`,
          height: `${String(box.height)}px`,
          background: "#333",
        });
        document.body.append(el);
      }
    },
    [SIDEBAR, HOTBAR] as const,
  );
}

async function scattered(page: Page): Promise<void> {
  await page.goto("/?module=dock&service=mock&players=p1,p2");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile")).toHaveCount(3, {
    timeout: 20_000,
  });
  await addControls(page);
  await page.locator(".mav-dock-placement").click();
  await page
    .getByRole("menuitemradio", { name: "Scattered over the screen" })
    .click();
  await expect(page.locator(".mav-dock")).toHaveAttribute(
    "data-placement",
    "scattered",
  );
}

const tile = (page: Page, id: string): Locator =>
  page.locator(`.mav-dock-tile[data-participant-id="${id}"]`);

async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (!box) throw new Error("not on screen");
  return box;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

async function expectClear(page: Page, sidebar: Box = SIDEBAR): Promise<void> {
  const all = [
    ...(await page.locator(".mav-dock-tile").all()),
    page.locator(".mav-dock-panel"),
  ];
  for (const target of all) {
    const box = await boxOf(target);
    expect(overlaps(box, sidebar), "covers the sidebar").toBe(false);
    expect(overlaps(box, HOTBAR), "covers the hotbar").toBe(false);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(box.y + box.height).toBeLessThanOrEqual(720);
  }
}

test("scatters the tiles to free corners, clear of Foundry's controls", async ({
  page,
}) => {
  await scattered(page);

  await expectClear(page);
  const anchors = await page
    .locator(".mav-dock-tile")
    .evaluateAll((tiles) =>
      tiles.map((t) => (t as HTMLElement).dataset.anchor),
    );
  expect(new Set(anchors).size).toBe(3);
  await expect(page.locator(".mav-dock-panel")).toHaveAttribute(
    "data-anchor",
    "bottom-left",
  );
});

test("follows the sidebar when it collapses and opens", async ({ page }) => {
  await scattered(page);
  const pushed = await boxOf(tile(page, "p1"));
  expect(pushed.x + pushed.width).toBeLessThanOrEqual(SIDEBAR.x);

  await page.evaluate(() => {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.style.width = "40px";
    if (sidebar) sidebar.style.left = "1240px";
  });

  // Back against the window's right edge, clear of the narrow sidebar.
  await expect
    .poll(async () => {
      const box = await boxOf(tile(page, "p1"));
      return Math.round(box.x + box.width);
    })
    .toBeGreaterThan(SIDEBAR.x);
  await expectClear(page, { x: 1240, y: 0, width: 40, height: 720 });
});

test("a dragged tile stays against its corner when the window resizes", async ({
  page,
}) => {
  await scattered(page);
  const before = await boxOf(tile(page, "p2"));

  await page.mouse.move(before.x + 60, before.y + 40);
  await page.mouse.down();
  await page.mouse.move(700, 520, { steps: 5 });
  await page.mouse.up();

  await expect(tile(page, "p2")).toHaveAttribute("data-anchor", "bottom");
  const placed = await boxOf(tile(page, "p2"));
  await page.setViewportSize({ width: 1100, height: 620 });
  await expect
    .poll(async () => Math.round(620 - (await boxOf(tile(page, "p2"))).y))
    .toBe(Math.round(720 - placed.y));
});

test("moves and resizes a tile with the keyboard", async ({ page }) => {
  await scattered(page);
  const target = tile(page, "p1");
  const before = await boxOf(target);
  const move = target.locator(".mav-dock-tile-move");

  await move.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await target.locator(".mav-dock-tile-resize").focus();
  await page.keyboard.press("Shift+ArrowRight");

  const after = await boxOf(target);
  expect(Math.round(after.y - before.y)).toBe(20);
  expect(Math.round(after.width - before.width)).toBe(50);
  await expect(target.locator(".mav-dock-tile-resize")).toBeFocused();
});

test("saves where a tile was moved in the player's setting", async ({
  page,
}) => {
  await scattered(page);
  await tile(page, "p1").locator(".mav-dock-tile-move").focus();
  await page.keyboard.press("Shift+ArrowDown");
  const moved = await boxOf(tile(page, "p1"));
  const saved = await page.evaluate(() =>
    window.harness?.client.game.settings.get(
      "modular-av-dock",
      "scatteredLayouts",
    ),
  );

  expect(saved).toMatchObject({
    own: { tiles: { p1: { anchor: expect.any(String) } } },
  });
  expect(moved.y).toBeGreaterThan(0);
});
