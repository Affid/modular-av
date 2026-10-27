// Milestone 9 end to end: the dock's scattered layout among Foundry's own
// controls, a GM's layout for a scene, and themes (modular-av-dock-vines).
import { expect, type Page, test } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  idOf,
  openGm,
  openPlayer,
  type Player,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

/** The dock's own settings back to their defaults, for the suites after. */
async function resetDock(player: Player): Promise<void> {
  await player.run(async (_api, game) => {
    await game.settings.set("modular-av-dock", "mode", "docked");
    await game.settings.set("modular-av-dock", "scatteredLayouts", {
      own: { tiles: {}, panel: null },
      scenes: {},
    });
    await game.settings.set("modular-av-dock", "theme", "");
  }, null);
}

test.afterEach(async () => {
  for (const player of open) await resetDock(player);
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "dock");
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/**
 * The visible parts of Foundry's controls, by selector: its containers
 * are tall and mostly empty, and a collapsed sidebar's content is off
 * screen.
 */
async function controls(page: Page): Promise<Record<string, Box>> {
  const parts = [
    "#sidebar-tabs menu > li",
    "#sidebar-content",
    "#scene-controls-layers > li",
    "#players li",
    "#hotbar",
  ];
  const boxes: Record<string, Box> = {};
  for (const selector of parts)
    for (const [i, part] of (await page.locator(selector).all()).entries()) {
      const box = await part.boundingBox();
      const onScreen = box && box.width > 0 && box.x < 1600;
      if (onScreen) boxes[`${selector} ${String(i)}`] = box;
    }
  return boxes;
}

/** What the dock covers of Foundry's controls now, by name; none is right. */
async function covered(page: Page): Promise<string[]> {
  const avoid = await controls(page);
  const targets = [
    ...(await page.locator("#camera-views .mav-dock-tile").all()),
    page.locator("#camera-views .mav-dock-panel"),
  ];
  const hits: string[] = [];
  for (const target of targets) {
    const box = await target.boundingBox();
    if (!box) return ["(a tile isn't on screen)"];
    for (const [part, control] of Object.entries(avoid))
      if (overlaps(box, control)) hits.push(part);
  }
  return hits;
}

/** Clear of Foundry's controls once they settle (the sidebar slides). */
async function expectClearOfFoundry(page: Page): Promise<void> {
  expect(Object.keys(await controls(page)).join(" ")).toMatch(/hotbar/);
  await expect.poll(() => covered(page)).toEqual([]);
}

async function scatter(page: Page): Promise<void> {
  await page.locator(".mav-dock-placement").click();
  await page
    .getByRole("menuitemradio", { name: /Scattered over the screen/ })
    .click();
  await expect(page.locator("#camera-views .mav-dock")).toHaveAttribute(
    "data-placement",
    "scattered",
  );
}

test("scattered tiles stay clear of Foundry's controls and follow the sidebar", async ({
  browser,
}) => {
  // No call needed: the player's own tile shows.
  const p1 = track(await openPlayer(browser, "Player1"));
  const self = await p1.run((_api, game) => game.userId, null);
  // Against the top right corner, where the sidebar is.
  await p1.run(async (_api, game, id) => {
    await game.settings.set("modular-av-dock", "scatteredLayouts", {
      own: {
        tiles: { [id]: { anchor: "top-right", dx: -8, dy: 8, width: 240 } },
        panel: null,
      },
      scenes: {},
    });
  }, self);

  // The test world starts with the sidebar collapsed.
  await p1.page.evaluate(() => {
    (
      globalThis as unknown as { ui: { sidebar: { expand(): void } } }
    ).ui.sidebar.expand();
  });
  await scatter(p1.page);

  await expectClearOfFoundry(p1.page);
  const tile = p1.page.locator(
    `#camera-views .mav-dock-tile[data-participant-id="${self}"]`,
  );
  const beside = await tile.boundingBox();
  await p1.page.evaluate(() => {
    (
      globalThis as unknown as { ui: { sidebar: { collapse(): void } } }
    ).ui.sidebar.collapse();
  });
  await expect
    .poll(async () => (await tile.boundingBox())?.x ?? 0)
    .toBeGreaterThan((beside?.x ?? 0) + 50);
  await expectClearOfFoundry(p1.page);
  await p1.page.evaluate(() => {
    (
      globalThis as unknown as { ui: { sidebar: { expand(): void } } }
    ).ui.sidebar.expand();
  });
  await expect
    .poll(async () => Math.round((await tile.boundingBox())?.x ?? 0))
    .toBe(Math.round(beside?.x ?? 0));
});

test("a player who left it scattered gets it back after a reload", async ({
  browser,
}) => {
  const p1 = track(await openPlayer(browser, "Player1"));
  await p1.run(async (_api, game) => {
    await game.settings.set("modular-av-dock", "mode", "scattered");
  }, null);

  // Foundry's hotbar isn't rendered yet when the dock first places itself.
  await p1.page.reload();

  await expect(
    p1.page.locator("#camera-views .mav-dock-panel > .mav-dock-header"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    p1.page.locator("#camera-views .mav-dock-tile[data-anchor]"),
  ).toHaveCount(1);
  await expectClearOfFoundry(p1.page);
});

test("a GM's layout for the scene reaches a player", async ({ browser }) => {
  const gm = track(await openGm(browser));
  const p1 = track(await openPlayer(browser, "Player1"));
  for (const player of [gm, p1]) await expectStatus(player, "connected");
  const gmId = await idOf(gm, "Gamemaster");
  const sceneId = await gm.run(async () => {
    const Scene = (
      globalThis as unknown as {
        Scene: {
          create(data: object): Promise<{ id: string }>;
        };
      }
    ).Scene;
    const scene = await Scene.create({ name: "M9 tavern", active: true });
    return scene.id;
  }, null);

  try {
    // The GM's own tile against the bottom right, saved as the scene's.
    await gm.run(async (_api, game, id) => {
      await game.settings.set("modular-av-dock", "scatteredLayouts", {
        own: {
          tiles: {
            [id]: { anchor: "bottom-right", dx: -8, dy: -8, width: 300 },
          },
          panel: null,
        },
        scenes: {},
      });
    }, gmId);
    await scatter(gm.page);
    await gm.page.locator(".mav-dock-placement").click();
    await gm.page.locator('[data-action="save-scene-layout"]').click();
    await scatter(p1.page);

    const gmTile = p1.page.locator(
      `#camera-views .mav-dock-tile[data-participant-id="${gmId}"]`,
    );
    await expect(gmTile).toHaveAttribute("data-anchor", "bottom-right");
    await expect(gmTile).toHaveCSS("width", "300px");
  } finally {
    await gm.run(async (_api, _game, id) => {
      const scenes = (
        globalThis as unknown as {
          game: { scenes: { get(id: string): { delete(): Promise<unknown> } } };
        }
      ).game.scenes;
      await scenes.get(id).delete();
    }, sceneId);
  }
});

test("choosing a theme loads only its stylesheet, and back", async ({
  browser,
}) => {
  const p1 = track(await openPlayer(browser, "Player1"));
  await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
  const loaded = p1.page.waitForResponse((r) =>
    r.url().endsWith("/modules/modular-av-dock-vines/vines.css"),
  );

  await p1.page.locator(".mav-dock-settings").click();
  await p1.page
    .locator("#modular-av-settings")
    .getByLabel("Theme", { exact: true })
    .selectOption("vines");

  expect((await loaded).status()).toBe(200);
  await expect(p1.page.locator("html")).toHaveClass(/mav-theme-vines/);
  await expect(p1.page.locator("link[data-mav-theme]")).toHaveCount(1);
  await p1.page
    .locator("#modular-av-settings")
    .getByLabel("Theme", { exact: true })
    .selectOption("default");
  await expect(p1.page.locator("link[data-mav-theme]")).toHaveCount(0);
  await expect(p1.page.locator("html")).not.toHaveClass(/mav-theme-/);
});
