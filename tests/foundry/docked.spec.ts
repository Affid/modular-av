// The docked dock's size: its inner edge resizes it, the grip shows on
// hover, and a player's size lasts a reload until a double-click resets it.
import { expect, type Locator, type Page, test } from "@playwright/test";
import { configureWorld, openPlayer, type Player } from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "dock");
});

test.afterEach(async () => {
  for (const player of open)
    await player.run(async (_api, game) => {
      await game.settings.set("modular-av-dock", "dockedSize", {
        width: null,
        height: null,
      });
    }, null);
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

async function choose(page: Page, name: string): Promise<void> {
  await page.locator(".mav-dock-placement").click();
  await page.getByRole("menuitemradio", { name }).click();
}

const widthOf = async (locator: Locator): Promise<number> =>
  Math.round((await locator.boundingBox())?.width ?? 0);

const opacityOf = (locator: Locator): Promise<string> =>
  locator.evaluate((element) => getComputedStyle(element).opacity);

async function centreOf(locator: Locator): Promise<[number, number]> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not on screen");
  return [box.x + box.width / 2, box.y + box.height / 2];
}

test("docked on the right, the inner edge's grip resizes the dock and it lasts a reload", async ({
  browser,
}) => {
  const p1 = track(await openPlayer(browser, "Player1"));
  const page = p1.page;
  const host = page.locator("#camera-views");
  const edge = page.locator("#camera-views .mav-dock-edge");
  const grip = page.locator("#camera-views .mav-dock-edge-grip");
  const tile = page.locator("#camera-views .mav-dock-tile").first();
  await expect(page.locator("#camera-views .mav-dock")).toBeVisible();

  await choose(page, "Docked on the right");
  try {
    await expect(page.locator("#camera-views .mav-dock")).toHaveAttribute(
      "data-placement",
      "right",
    );
    expect(await widthOf(host)).toBe(300);
    await page.mouse.move(400, 400);
    await expect.poll(() => opacityOf(grip)).toBe("0");

    // Hovering the edge shows the grip.
    await page.mouse.move(...(await centreOf(edge)));
    await expect.poll(() => opacityOf(grip)).toBe("1");

    const tileBefore = await widthOf(tile);
    const [x, y] = await centreOf(grip);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 4 });
    await page.mouse.move(x - 120, y, { steps: 4 });
    await page.mouse.up();

    await expect.poll(() => widthOf(host)).toBe(420);
    await expect.poll(() => widthOf(tile)).toBeGreaterThan(tileBefore);

    await page.reload();
    await expect(page.locator("#camera-views .mav-dock")).toBeVisible({
      timeout: 60_000,
    });
    await expect.poll(() => widthOf(host)).toBe(420);

    await edge.dblclick();
    await expect.poll(() => widthOf(host)).toBe(300);
  } finally {
    await choose(page, "Docked on the left");
  }
});
