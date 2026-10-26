import type { AVState } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

/**
 * The module in the harness with the core and the mock service, on the
 * generated camera (a person before a bookshelf; scripts/foundry/
 * fake-camera.ts): what is sent is the effect's, with the shelf blurred.
 */

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Regions {
  readonly shelf: readonly Box[];
  readonly face: readonly Box[];
}

/** Regions of the generated camera: the bookshelf beside the person, the face. */
const REGIONS: Regions = {
  shelf: [
    { x: 10, y: 90, width: 100, height: 160 },
    { x: 530, y: 90, width: 100, height: 160 },
  ],
  face: [{ x: 290, y: 170, width: 60, height: 70 }],
};

/** Mean luma gradient in each kind of region of one frame of `source`. */
function detail(
  page: Page,
  source: "sent" | "raw",
): Promise<Record<keyof Regions, number>> {
  return page.evaluate(
    async ({ from, regions }) => {
      type Processor = new (init: { track: MediaStreamTrack }) => {
        readable: ReadableStream<VideoFrame>;
      };
      const track =
        from === "sent"
          ? window.harness?.pipeline?.track("camera")
          : (
              await navigator.mediaDevices.getUserMedia({ video: true })
            ).getVideoTracks()[0];
      if (!track) throw new Error(`no ${from} camera`);
      const Processor = (
        globalThis as unknown as { MediaStreamTrackProcessor: Processor }
      ).MediaStreamTrackProcessor;
      const reader = new Processor({
        track: track.clone(),
      }).readable.getReader();
      // Skip a few frames: the first can predate the effect's mask.
      let frame: VideoFrame | undefined;
      for (let i = 0; i < 5; i += 1) {
        frame?.close();
        frame = (await reader.read()).value;
      }
      await reader.cancel();
      if (!frame) throw new Error("no frame");
      const canvas = new OffscreenCanvas(640, 480);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(frame, 0, 0, 640, 480);
      frame.close();
      const measure = (r: {
        x: number;
        y: number;
        width: number;
        height: number;
      }): number => {
        const { data } = ctx.getImageData(r.x, r.y, r.width, r.height);
        const luma = (i: number): number =>
          0.299 * (data[i] ?? 0) +
          0.587 * (data[i + 1] ?? 0) +
          0.114 * (data[i + 2] ?? 0);
        let sum = 0;
        for (let y = 0; y < r.height - 1; y += 1)
          for (let x = 0; x < r.width - 1; x += 1) {
            const i = (y * r.width + x) * 4;
            sum +=
              Math.abs(luma(i) - luma(i + 4)) +
              Math.abs(luma(i) - luma(i + r.width * 4));
          }
        return sum / ((r.width - 1) * (r.height - 1));
      };
      const mean = (
        list: readonly {
          x: number;
          y: number;
          width: number;
          height: number;
        }[],
      ): number =>
        list.reduce((total, r) => total + measure(r), 0) / list.length;
      return { shelf: mean(regions.shelf), face: mean(regions.face) };
    },
    { from: source, regions: REGIONS },
  );
}

const state = (page: Page): Promise<AVState> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { state: { get(): AVState } } | undefined;
    if (!api) throw new Error("no core API");
    return api.state.get();
  });

const setEffect = (page: Page, id: string, on: boolean): Promise<void> =>
  page.evaluate(
    ({ effect, enabled }) =>
      (
        window.harness?.client.game.modules.get("modular-av")?.api as {
          commands: {
            setEffectEnabled(id: string, on: boolean): Promise<void>;
          };
        }
      ).commands.setEffectEnabled(effect, enabled),
    { effect: id, enabled: on },
  );

test("blur sends the camera with the shelf behind the person blurred and the face kept", async ({
  page,
}) => {
  // Arrange
  await page.goto("/?module=cam-background&service=mock");
  await page.waitForFunction(() => window.harness !== undefined);
  await expect
    .poll(() =>
      page.evaluate(() => window.harness?.pipeline?.published().camera?.id),
    )
    .toBeTruthy();
  const raw = await detail(page, "raw");

  // Act
  await setEffect(page, "background-blur", true);

  // Assert
  await expect
    .poll(
      async () => (await state(page)).local.effects["background-blur"]?.status,
      {
        timeout: 30_000,
      },
    )
    .toBe("running");
  expect((await state(page)).local.cameraHold).toBeNull();
  const sent = await detail(page, "sent");
  test.info().annotations.push({
    type: "detail",
    description: `shelf ${raw.shelf.toFixed(1)} → ${sent.shelf.toFixed(1)}, face ${raw.face.toFixed(1)} → ${sent.face.toFixed(1)}`,
  });
  expect(sent.shelf).toBeLessThan(raw.shelf * 0.4);
  expect(sent.face).toBeGreaterThan(raw.face * 0.6);
});
