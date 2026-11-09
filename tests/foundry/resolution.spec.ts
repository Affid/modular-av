// Issue #8 end to end: a player raises their camera's resolution and the
// others receive it, over P2P (no server needed).
import { expect, test } from "@playwright/test";
import base from "../../playwright.foundry.config.ts";
import {
  configureWorld,
  expectStatus,
  idOf,
  openPlayer,
  type Player,
} from "./world.ts";

// Chrome's own fake camera gives any size; the suite's file camera only 640x480.
test.use({
  launchOptions: {
    args: (base.use?.launchOptions?.args ?? []).filter(
      (arg) => !arg.startsWith("--use-file-for-fake-video-capture"),
    ),
  },
});

test.describe.configure({ mode: "serial" });

let open: Player[] = [];

const track = (player: Player): Player => {
  open = [...open, player];
  return player;
};

/**
 * "WxH" of the next frame of `id`'s camera in `viewer`'s dock; "" if none
 * comes. The dock's tile is on screen, so the viewer's core doesn't pause it.
 */
const receivedSize = (viewer: Player, id: string): Promise<string> =>
  viewer.run(
    (_api, _game, participant) =>
      new Promise<string>((resolve) => {
        const video = document.querySelector<HTMLVideoElement>(
          `#camera-views .mav-dock-tile[data-participant-id="${participant}"] video.mav-dock-tile-video`,
        );
        if (!video?.srcObject) {
          resolve("");
          return;
        }
        const timer = setTimeout(() => {
          resolve("");
        }, 2000);
        video.requestVideoFrameCallback((_now, frame) => {
          clearTimeout(timer);
          resolve(`${String(frame.width)}x${String(frame.height)}`);
        });
      }),
    id,
  );

test.beforeAll(async ({ browser }) => {
  await configureWorld(browser, "p2p", "dock");
});

test.afterEach(async () => {
  await Promise.all(
    open.map((p) =>
      p.run((api) => api.commands.setVideoResolution("default"), null),
    ),
  );
  await Promise.all(open.map((p) => p.close()));
  open = [];
});

test.afterAll(async ({ browser }) => {
  await configureWorld(browser, "livekit", "foundry");
});

test("a player raises their camera's resolution and the others receive it", async ({
  browser,
}) => {
  // Arrange
  const p1 = track(await openPlayer(browser, "Player1"));
  const p2 = track(await openPlayer(browser, "Player2"));
  // One Chrome holds a camera once for all its pages, at the size it opened at.
  await p2.run((api) => api.commands.setVideoEnabled(false), null);
  await expectStatus(p1, "connected");
  const p1Id = await idOf(p2, "Player1");
  await expect
    .poll(() => receivedSize(p2, p1Id), { timeout: 60_000 })
    .toBe("640x480");

  // Act
  await p1.run((api) => api.commands.setVideoResolution("720p"), null);

  // Assert
  expect((await p1.state()).local.videoResolution).toBe("720p");
  await expect
    .poll(() => receivedSize(p2, p1Id), { timeout: 30_000 })
    .toBe("1280x720");
  expect([...p1.notices, ...p2.notices]).toEqual([]);
});
