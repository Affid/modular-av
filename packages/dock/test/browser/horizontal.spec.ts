// Docked at the top or bottom: header and panel as equal side columns,
// the tiles fitted between them in as many rows as fit, and a slim bar
// when collapsed.
import type {} from "@modular-av/testing/harness";
import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 900 } });

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(target: Locator): Promise<Box> {
  const box = await target.boundingBox();
  if (!box) throw new Error("not on screen");
  return box;
}

const players = (count: number): string =>
  Array.from({ length: count }, (_, i) => `p${String(i + 1)}`).join(",");

/** A call with `others` more players, docked on `side`. */
async function docked(
  page: Page,
  side: "top" | "bottom",
  others: number,
): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    `/?module=dock&service=mock&sample=1&players=${players(others)}`,
  );
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile")).toHaveCount(others + 1, {
    timeout: 30_000,
  });
  await page.locator(".mav-dock-placement").click();
  await page
    .getByRole("menuitemradio", {
      name: side === "top" ? "Docked at the top" : "Docked at the bottom",
    })
    .click();
  await expect(page.locator(".mav-dock")).toHaveAttribute(
    "data-placement",
    side,
  );
}

const tiles = (page: Page): Locator => page.locator(".mav-dock-tile");

async function rowsOf(page: Page): Promise<number> {
  const tops = new Set<number>();
  for (const tile of await tiles(page).all())
    tops.add(Math.round((await boxOf(tile)).y));
  return tops.size;
}

test("six players fit in two rows without spilling sideways", async ({
  page,
}) => {
  await docked(page, "top", 5);

  await expect.poll(() => rowsOf(page)).toBe(2);
  const list = page.locator(".mav-dock-tiles");
  const spills = await list.evaluate((l) => l.scrollWidth > l.clientWidth);
  expect(spills).toBe(false);
});

test("a strip too full to fit scrolls sideways from its first tile, by the wheel too", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await docked(page, "top", 11);
  const list = page.locator(".mav-dock-tiles");
  await expect
    .poll(() => list.evaluate((l) => l.scrollWidth > l.clientWidth))
    .toBe(true);

  const first = await boxOf(tiles(page).first());
  expect(first.x).toBeGreaterThanOrEqual((await boxOf(list)).x - 1);

  await list.hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => list.evaluate((l) => l.scrollLeft))
    .toBeGreaterThan(0);
});

test("header and panel are side columns of one width, the panel's buttons on one line", async ({
  page,
}) => {
  await docked(page, "bottom", 2);
  const header = await boxOf(page.locator(".mav-dock-header"));
  const panel = await boxOf(page.locator(".mav-dock-panel"));

  expect(Math.round(header.width)).toBe(Math.round(panel.width));
  const tops = new Set<number>();
  for (const button of await page
    .locator(".mav-dock-buttons > button:visible")
    .all())
    tops.add(Math.round((await boxOf(button)).y));
  expect(tops.size).toBe(1);
  // Not stretched down an empty dock.
  expect(panel.height).toBeLessThan(120);
});

test("one player's tile sits in the middle of the window", async ({ page }) => {
  await docked(page, "top", 0);
  const tile = await boxOf(tiles(page).first());

  expect(Math.abs(tile.x + tile.width / 2 - 800)).toBeLessThanOrEqual(2);
});

test("collapsed, it is one slim bar and gives the room back", async ({
  page,
}) => {
  await docked(page, "top", 2);

  await page.getByRole("button", { name: "Hide the cameras" }).click();

  await expect
    .poll(async () =>
      Math.round((await boxOf(page.locator(".mav-dock"))).height),
    )
    .toBe(56);
  const host = await boxOf(page.locator("#camera-views"));
  expect(Math.round(host.height)).toBe(56);
  const header = await boxOf(page.locator(".mav-dock-header"));
  const panel = await boxOf(page.locator(".mav-dock-panel"));
  expect(panel.x).toBeGreaterThan(header.x + header.width);
  expect(panel.x + panel.width).toBeGreaterThan(1500);
});

test("at the bottom, collapsing points down and expanding up", async ({
  page,
}) => {
  await docked(page, "bottom", 0);
  const collapse = page.getByRole("button", { name: "Hide the cameras" });

  await expect(collapse.locator("i")).toHaveClass(/fa-chevron-down/);
  await collapse.click();
  await expect(
    page.getByRole("button", { name: "Show the cameras" }).locator("i"),
  ).toHaveClass(/fa-chevron-up/);
});
