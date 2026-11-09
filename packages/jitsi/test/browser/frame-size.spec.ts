import { expect, type Page, test } from "@playwright/test";
import type { frameSize as FrameSizeFn } from "../../src/frame-size.ts";

const MODULE = `/@fs${new URL("../../src/frame-size.ts", import.meta.url).pathname}`;

/** Chromium's generated track, which TypeScript's DOM types lack. */
type GeneratorClass = new (init: { kind: "video" }) => MediaStreamTrack & {
  readonly writable: WritableStream<VideoFrame>;
};

/**
 * Measures a generated track, as a video effect's output is: it reports no
 * size of its own. `send` frames of that size, or none at all.
 */
function measureGenerated(
  page: Page,
  send: { width: number; height: number } | null,
): Promise<string> {
  return page.evaluate(
    async ({ modulePath, size }) => {
      const { frameSize } = (await import(modulePath)) as {
        frameSize: typeof FrameSizeFn;
      };
      const Generator = (
        globalThis as unknown as { MediaStreamTrackGenerator: GeneratorClass }
      ).MediaStreamTrackGenerator;
      const generator = new Generator({ kind: "video" });
      const writer = generator.writable.getWriter();
      const canvas = size ? new OffscreenCanvas(size.width, size.height) : null;
      canvas?.getContext("2d")?.fillRect(0, 0, 10, 10);
      let timestamp = 0;
      const timer = setInterval(() => {
        if (!canvas) return;
        timestamp += 33_000;
        void writer.write(new VideoFrame(canvas, { timestamp }));
      }, 33);
      const reported = generator.getSettings().height ?? "none";
      const measured = await frameSize(generator, 500);
      clearInterval(timer);
      generator.stop();
      return `${String(reported)} ${measured ? `${String(measured.width)}x${String(measured.height)}` : "null"}`;
    },
    { modulePath: MODULE, size: send },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?module=core");
});

test("measures the frames of a track that reports no size", async ({
  page,
}) => {
  expect(await measureGenerated(page, { width: 1280, height: 720 })).toBe(
    "none 1280x720",
  );
});

test("gives up on a track that sends no frame in time", async ({ page }) => {
  expect(await measureGenerated(page, null)).toBe("none null");
});
