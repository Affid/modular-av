// Milestone 5 end to end: modular-av-dock in the local Foundry world, in
// place of Foundry's camera dock, with LiveKit and with P2P.
import { expect, type Page, test } from "@playwright/test";
import {
  configureWorld,
  expectStatus,
  idOf,
  openGm,
  openPlayer,
  type Player,
  setVoiceMode,
} from "./world.ts";

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

const tile = (page: Page, id: string) =>
  page.locator(`#camera-views .mav-dock-tile[data-participant-id="${id}"]`);

/** Whether a tile's video shows frames, as the player would see them. */
const playing = (page: Page, id: string): Promise<boolean> =>
  tile(page, id)
    .locator("video")
    .evaluate((v: HTMLVideoElement) => v.videoWidth > 0 && !v.paused);

test.describe("with LiveKit", () => {
  test.beforeAll(async ({ browser }) => {
    await configureWorld(browser, "livekit", "dock");
  });

  test("the dock replaces Foundry's, and everyone shows in it with video", async ({
    browser,
  }) => {
    // Arrange / Act
    const gm = track(await openGm(browser));
    const p1 = track(await openPlayer(browser, "Player1"));
    for (const player of [gm, p1]) await expectStatus(player, "connected");
    const gmId = await idOf(p1, "Gamemaster");

    // Assert
    await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
    await expect(
      p1.page.locator("#camera-views video.user-camera"),
    ).toHaveCount(0);
    await expect(p1.page.locator(".mav-dock-status")).toHaveAttribute(
      "data-status",
      "connected",
    );
    await expect.poll(() => playing(p1.page, gmId)).toBe(true);
    expect([...gm.notices, ...p1.notices]).toEqual([]);
  });

  test("a mute and a GM's block show on the others' tiles", async ({
    browser,
  }) => {
    const gm = track(await openGm(browser));
    const p1 = track(await openPlayer(browser, "Player1"));
    await setVoiceMode(p1, "always");
    for (const player of [gm, p1]) await expectStatus(player, "connected");
    const p1Id = await idOf(gm, "Player1");

    await p1.page.locator(".mav-dock-mute").click();
    await expect(tile(gm.page, p1Id)).toHaveAttribute("data-muted", "");
    await expect(
      tile(gm.page, p1Id).locator('[data-indicator="muted"]'),
    ).toBeVisible();
    await tile(gm.page, p1Id).hover();
    await tile(gm.page, p1Id).locator(".mav-dock-tile-menu").click();
    await gm.page.locator('[data-action="block-video"]').click();

    try {
      await expect(tile(gm.page, p1Id)).toHaveAttribute(
        "data-blocked-video",
        "",
      );
      await expect(p1.page.locator(".mav-dock-video")).toBeDisabled();
    } finally {
      await gm.run(
        (api, _game, id) =>
          api.commands.setBroadcastPermissions(id, { video: true }),
        p1Id,
      );
    }
  });

  test("the settings window opens from the dock with the dock's sections", async ({
    browser,
  }) => {
    // Neither needs a call: no GM online to let Player1 join.
    const p1 = track(await openPlayer(browser, "Player1"));
    await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();

    await p1.page.locator(".mav-dock-settings").click();

    const window = p1.page.locator("#modular-av-settings");
    await expect(window.locator(".mav-settings")).toBeVisible();
    await expect(
      window.getByRole("heading", { name: "Devices" }),
    ).toBeVisible();
  });

  test("the dock moves into its own window and back", async ({ browser }) => {
    // Neither needs a call: no GM online to let Player1 join.
    const p1 = track(await openPlayer(browser, "Player1"));
    await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();

    await p1.page.locator(".mav-dock-placement").click();
    await p1.page
      .getByRole("menuitemradio", { name: "In a window of its own" })
      .click();

    await expect
      .poll(() =>
        p1.run(
          (api) =>
            api.windows.pip.current?.document.querySelectorAll(".mav-dock-tile")
              .length ?? 0,
          null,
        ),
      )
      .toBeGreaterThan(0);
    await p1.run((api) => {
      api.windows.pip.current?.close();
    }, null);
    await expect(p1.page.locator("#camera-views .mav-dock")).toBeVisible();
  });
});

test.describe("with P2P", () => {
  test.beforeAll(async ({ browser }) => {
    await configureWorld(browser, "p2p", "dock");
  });

  test.afterAll(async ({ browser }) => {
    await configureWorld(browser, "livekit", "dock");
  });

  test("players see each other in the dock and see a mute", async ({
    browser,
  }) => {
    const p1 = track(await openPlayer(browser, "Player1"));
    const p2 = track(await openPlayer(browser, "Player2"));
    await setVoiceMode(p1, "always");
    for (const player of [p1, p2]) await expectStatus(player, "connected");
    const p1Id = await idOf(p2, "Player1");

    await expect.poll(() => playing(p2.page, p1Id)).toBe(true);
    await p1.page.locator(".mav-dock-mute").click();

    await expect(tile(p2.page, p1Id)).toHaveAttribute("data-muted", "");
  });
});

test.describe("with Jitsi", () => {
  test.beforeAll(async ({ browser }) => {
    await configureWorld(browser, "jitsi", "dock");
  });

  test.afterAll(async ({ browser }) => {
    await configureWorld(browser, "livekit", "dock");
  });

  test("players see each other in the dock with connection details, and see a mute", async ({
    browser,
  }) => {
    track(await openGm(browser));
    const p1 = track(await openPlayer(browser, "Player1"));
    const p2 = track(await openPlayer(browser, "Player2"));
    await setVoiceMode(p1, "always");
    for (const player of [p1, p2]) await expectStatus(player, "connected");
    const p1Id = await idOf(p2, "Player1");

    await expect.poll(() => playing(p2.page, p1Id)).toBe(true);
    await expect
      .poll(
        // Rejects until the first measurement arrives (every 5 s).
        () =>
          p2.run((api, _game, id) => api.stats.get(id).catch(() => null), p1Id),
        { timeout: 30_000 },
      )
      .toMatchObject({ packetLoss: expect.any(Number) });
    await p1.page.locator(".mav-dock-mute").click();

    await expect(tile(p2.page, p1Id)).toHaveAttribute("data-muted", "");
  });
});
