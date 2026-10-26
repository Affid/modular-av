// Milestone 7 end to end: modular-av-cam-background in the local Foundry
// world with the dock, on LiveKit, on the generated camera (a person before
// a bookshelf; scripts/foundry/fake-camera.ts).
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

test.afterEach(async () => {
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

const setEffect = (player: Player, id: string, on: boolean): Promise<void> =>
  player.run(
    (api, _game, args) => api.commands.setEffectEnabled(args.id, args.on),
    { id, on },
  );

interface Detail {
  readonly shelf: number;
  readonly face: number;
}

/**
 * Fine detail (mean luma gradient) in a tile's video as `page` shows it:
 * the bookshelf beside the person and the face, as parts of the picture,
 * whatever size it was received at.
 */
const detail = (page: Page, participant: string): Promise<Detail> =>
  page
    .locator(
      `#camera-views .mav-dock-tile[data-participant-id="${participant}"] video`,
    )
    .evaluate((video: HTMLVideoElement) => {
      const width = 320;
      const height = 240;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || video.videoWidth === 0) return { shelf: -1, face: -1 };
      ctx.drawImage(video, 0, 0, width, height);
      // Parts of the 640×480 camera, halved.
      const measure = (x: number, y: number, w: number, h: number): number => {
        const { data } = ctx.getImageData(x, y, w, h);
        const luma = (i: number): number =>
          0.299 * (data[i] ?? 0) +
          0.587 * (data[i + 1] ?? 0) +
          0.114 * (data[i + 2] ?? 0);
        let sum = 0;
        for (let row = 0; row < h - 1; row += 1)
          for (let col = 0; col < w - 1; col += 1) {
            const i = (row * w + col) * 4;
            sum +=
              Math.abs(luma(i) - luma(i + 4)) +
              Math.abs(luma(i) - luma(i + w * 4));
          }
        return sum / ((w - 1) * (h - 1));
      };
      return {
        shelf: (measure(5, 45, 50, 80) + measure(265, 45, 50, 80)) / 2,
        face: measure(145, 85, 30, 35),
      };
    });

test.describe("with LiveKit", () => {
  test.beforeAll(async ({ browser }) => {
    await configureWorld(browser, "livekit", "dock");
  });

  test("the others see a player's background blurred, and the camera again once it is off", async ({
    browser,
  }) => {
    // Arrange
    const gm = track(await openGm(browser));
    const p1 = track(await openPlayer(browser, "Player1"));
    for (const player of [gm, p1]) await expectStatus(player, "connected");
    const p1Id = await idOf(gm, "Player1");
    await expect
      .poll(async () => (await detail(gm.page, p1Id)).shelf, {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    const raw = await detail(gm.page, p1Id);

    // Act
    await setEffect(p1, "background-blur", true);

    // Assert: running on Player1's side, blurred on the GM's.
    await expect
      .poll(
        async () => (await p1.state()).local.effects["background-blur"]?.status,
        { timeout: 30_000 },
      )
      .toBe("running");
    await expect
      .poll(async () => (await detail(gm.page, p1Id)).shelf, {
        timeout: 30_000,
      })
      .toBeLessThan(raw.shelf * 0.5);
    const blurred = await detail(gm.page, p1Id);
    test.info().annotations.push({
      type: "detail",
      description: `shelf ${raw.shelf.toFixed(1)} → ${blurred.shelf.toFixed(1)}, face ${raw.face.toFixed(1)} → ${blurred.face.toFixed(1)}`,
    });
    expect(blurred.face).toBeGreaterThan(raw.face * 0.5);

    // Turned off: the camera as it is again.
    await setEffect(p1, "background-blur", false);
    await expect
      .poll(async () => (await detail(gm.page, p1Id)).shelf, {
        timeout: 30_000,
      })
      .toBeGreaterThan(raw.shelf * 0.7);
    expect([...gm.notices, ...p1.notices]).toEqual([]);
  });
});
