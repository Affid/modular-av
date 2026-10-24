import type {} from "@modular-av/testing/harness";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const ENV_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-env.ts")}`;

interface View {
  readonly visible: boolean;
  readonly height: number;
}

declare global {
  interface Window {
    views?: View[];
    video?: HTMLVideoElement;
    stopWatching?: () => void;
  }
}

/** A 160 px tall video in the page, watched by the browser environment. */
async function watchVideo(page: Page): Promise<void> {
  await page.goto("/?module=core");
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate(async (modulePath) => {
    const { createBrowserMediaEnv } = (await import(modulePath)) as {
      createBrowserMediaEnv: (assetUrl: (p: string) => string) => {
        watchOnScreen(
          element: HTMLVideoElement,
          listener: (view: View) => void,
        ): () => void;
      };
    };
    const video = document.createElement("video");
    video.style.cssText = "display:block;width:200px;height:160px";
    document.body.append(video);
    window.video = video;
    window.views = [];
    window.stopWatching = createBrowserMediaEnv((p) => p).watchOnScreen(
      video,
      (view) => window.views?.push(view),
    );
  }, ENV_MODULE);
}

const lastView = (page: Page): Promise<View | undefined> =>
  page.evaluate(() => window.views?.at(-1));

test("a video in view is seen with its height in device pixels", async ({
  page,
}) => {
  await watchVideo(page);

  await expect
    .poll(() => lastView(page))
    .toEqual({
      visible: true,
      height: 160 * (await page.evaluate(() => devicePixelRatio)),
    });
});

test("a video moved out of view is no longer seen, and seen again back", async ({
  page,
}) => {
  await watchVideo(page);
  await expect.poll(async () => (await lastView(page))?.visible).toBe(true);

  await page.evaluate(() => {
    if (window.video) window.video.style.transform = "translateY(-5000px)";
  });
  await expect.poll(async () => (await lastView(page))?.visible).toBe(false);
  await page.evaluate(() => {
    if (window.video) window.video.style.transform = "";
  });

  await expect.poll(async () => (await lastView(page))?.visible).toBe(true);
});

test("a video moved into another document is followed there", async ({
  page,
}) => {
  await watchVideo(page);
  await page.evaluate(async () => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "width:400px;height:400px";
    document.body.prepend(frame);
    await new Promise((resolve) => setTimeout(resolve, 50));
    window.views = [];
    const video = window.video;
    if (video) {
      video.style.height = "100px";
      frame.contentDocument?.body.append(video);
    }
  });

  await expect
    .poll(() => lastView(page))
    .toEqual({
      visible: true,
      height: 100 * (await page.evaluate(() => devicePixelRatio)),
    });
});

test("nothing is reported once the watch stops", async ({ page }) => {
  await watchVideo(page);
  await expect.poll(async () => (await lastView(page))?.visible).toBe(true);

  const count = await page.evaluate(async () => {
    window.stopWatching?.();
    const before = window.views?.length ?? 0;
    if (window.video) window.video.style.height = "50px";
    await new Promise((resolve) => setTimeout(resolve, 200));
    return (window.views?.length ?? 0) - before;
  });

  expect(count).toBe(0);
});
