import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { watchFrames as WatchFrames } from "../../src/media/browser-frames.ts";

const FRAMES_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-frames.ts")}`;

test("the frame watchdog counts the fake camera's frames and stops cleanly", async ({
  page,
}) => {
  // Arrange
  await page.goto("/?module=core");
  await page.waitForFunction(() => window.harness !== undefined);

  // Act
  const result = await page.evaluate(async (modulePath) => {
    const { canWatchFrames, watchFrames } = (await import(modulePath)) as {
      canWatchFrames: () => boolean;
      watchFrames: typeof WatchFrames;
    };
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const [camera] = stream.getVideoTracks();
    if (!camera) throw new Error("no fake camera");
    let frames = 0;
    const stop = watchFrames(camera, () => {
      frames += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    stop();
    const atStop = frames;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const sent = camera.readyState;
    camera.stop();
    return { supported: canWatchFrames(), atStop, after: frames, sent };
  }, FRAMES_MODULE);

  // Assert
  expect(result.supported).toBe(true);
  expect(result.atStop).toBeGreaterThan(10);
  expect(result.after).toBe(result.atStop);
  expect(result.sent).toBe("live");
});
