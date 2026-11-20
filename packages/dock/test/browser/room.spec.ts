// The room under the cameras, which the dock tells a theme: the height
// left under the grid, and under each tile that ends its column.
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

async function open(page: Page, players: number): Promise<void> {
  const ids = Array.from({ length: players }, (_, i) => `p${String(i + 1)}`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?module=dock&service=mock&players=${ids.join(",")}`);
  await page.waitForFunction(() => window.harness !== undefined);
  await expect(page.locator(".mav-dock-tile")).toHaveCount(players + 1, {
    timeout: 30_000,
  });
  // The harness's page has no height of its own: a docked dock would grow.
  await page.addStyleTag({ content: "#camera-views { height: 100vh }" });
}

interface Told {
  /** `--mav-dock-spare`, and the height measured under the last row. */
  readonly spare: number;
  readonly measured: number;
  /** Each tile's `--mav-dock-tile-room`, and the same measured, in tile widths. */
  readonly rooms: readonly number[];
  readonly under: readonly number[];
}

/** What the dock says, beside what the page's layout says. */
const told = (page: Page): Promise<Told> =>
  page.evaluate(() => {
    const list = document.querySelector<HTMLElement>(".mav-dock-tiles");
    if (!list) throw new Error("No tile list");
    const tiles = [...list.querySelectorAll<HTMLElement>(".mav-dock-tile")];
    const floor =
      list.getBoundingClientRect().bottom -
      parseFloat(getComputedStyle(list).paddingBottom);
    const boxes = tiles.map((tile) => {
      const box = tile.getBoundingClientRect();
      const margin = parseFloat(getComputedStyle(tile).marginBottom);
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        end: box.bottom + margin,
      };
    });
    const lowest = Math.max(...boxes.map((b) => b.end));
    return {
      spare: Number(list.style.getPropertyValue("--mav-dock-spare")),
      measured: floor - lowest,
      rooms: tiles.map((tile) =>
        Number(tile.style.getPropertyValue("--mav-dock-tile-room")),
      ),
      under: boxes.map((b) =>
        boxes.some(
          (o) =>
            o.end > b.end + 1 && o.left < b.right - 1 && o.right > b.left + 1,
        )
          ? 0
          : (floor - b.end) / b.width,
      ),
    };
  });

async function expectTold(page: Page): Promise<Told> {
  // The grid is fitted a frame after a change: wait until what is told holds.
  await expect
    .poll(async () => {
      const now = await told(page);
      return Math.abs(now.spare - now.measured);
    })
    .toBeLessThanOrEqual(2);
  const now = await told(page);
  now.rooms.forEach((room, i) => {
    expect(room, `tile ${String(i)}`).toBeCloseTo(now.under[i] ?? 0, 1);
  });
  return now;
}

test("docked, the last tile of the column is told the height left under it", async ({
  page,
}) => {
  await open(page, 1);

  const now = await expectTold(page);

  expect(now.spare).toBeGreaterThan(100);
  expect(now.rooms[0]).toBe(0);
  expect(now.rooms[1]).toBeGreaterThan(0.4);
});

test("in two columns, each column's last tile is told its own room", async ({
  page,
}) => {
  await open(page, 8);
  await expect(page.locator(".mav-dock-tiles")).toHaveCSS(
    "--mav-dock-columns",
    "2",
  );

  const now = await expectTold(page);

  // Nine tiles: the ninth ends the first column, the eighth the second, a row higher.
  expect(now.rooms.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(now.rooms[7]).toBeGreaterThan(now.rooms[8] ?? 0);
  expect(now.rooms[8]).toBeGreaterThan(0);
});

test("with one player large, the thumbnails under it are told their room", async ({
  page,
}) => {
  await open(page, 4);
  await page.getByRole("button", { name: "Show one player large" }).click();
  await expect(page.locator(".mav-dock-tile[data-focused]")).toHaveCount(1);

  const now = await expectTold(page);

  expect(now.rooms.filter((room) => room > 0).length).toBeGreaterThan(0);
});

test("a full dock has no room, and scattered tiles are told none", async ({
  page,
}) => {
  await open(page, 5);

  const full = await expectTold(page);
  expect(full.spare).toBeLessThan(40);

  await page.locator(".mav-dock-placement").click();
  await page
    .getByRole("menuitemradio", { name: /Scattered over the screen/ })
    .click();
  await expect(
    page.locator(".mav-dock-tile[data-anchor]").first(),
  ).toBeVisible();
  const list = page.locator(".mav-dock-tiles");
  await expect
    .poll(() =>
      list.evaluate((el) => el.style.getPropertyValue("--mav-dock-spare")),
    )
    .toBe("0");
  for (const tile of await page.locator(".mav-dock-tile").all())
    expect(
      await tile.evaluate((el) =>
        el.style.getPropertyValue("--mav-dock-tile-room"),
      ),
    ).toBe("0");
});

test("docked at the top, where tiles fill the height, there is no room", async ({
  page,
}) => {
  await open(page, 2);
  await page.locator(".mav-dock-placement").click();
  await page.getByRole("menuitemradio", { name: "Docked at the top" }).click();
  const list = page.locator(".mav-dock-tiles");

  await expect
    .poll(() =>
      list.evaluate((el) => el.style.getPropertyValue("--mav-dock-spare")),
    )
    .toBe("0");
});
