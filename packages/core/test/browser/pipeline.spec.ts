import type { AVState } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

/** The core with the mock service and real test effects, in Chrome. */
async function openPipeline(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?module=core&service=mock&effects=test");
  await page.waitForFunction(() => window.harness !== undefined);
  expect(errors).toEqual([]);
  await expect
    .poll(() => state(page).then((s) => s.session.status))
    .toBe("connected");
}

const state = (page: Page): Promise<AVState> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { state: { get(): AVState } } | undefined;
    if (!api) throw new Error("no api");
    return api.state.get();
  });

const published = (page: Page) =>
  page.evaluate(() => window.harness?.pipeline?.published() ?? {});

const setEffect = (page: Page, id: string, enabled: boolean) =>
  page.evaluate(
    async ({ effect, on }) => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api as
        | {
            commands: {
              setEffectEnabled(id: string, enabled: boolean): Promise<void>;
            };
          }
        | undefined;
      await api?.commands.setEffectEnabled(effect, on);
    },
    { effect: id, on: enabled },
  );

test("a microphone effect joins the chain without changing the sent track", async ({
  page,
}) => {
  // Arrange
  await openPipeline(page);
  await expect
    .poll(() => published(page).then((p) => p.microphone))
    .toBeTruthy();
  const before = (await published(page)).microphone?.id;

  // Act
  await setEffect(page, "test-gain", true);

  // Assert
  await expect
    .poll(() => state(page).then((s) => s.local.effects["test-gain"]?.status))
    .toBe("running");
  expect((await published(page)).microphone?.id).toBe(before);
  await setEffect(page, "test-gain", false);
  await expect
    .poll(() => state(page).then((s) => s.local.effects["test-gain"]?.status))
    .toBe("off");
  expect((await published(page)).microphone?.id).toBe(before);
});

test("a camera effect fails closed: only its frames go out, and none while it stalls", async ({
  page,
}) => {
  // Arrange
  await openPipeline(page);
  await expect.poll(() => published(page).then((p) => p.camera)).toBeTruthy();
  const raw = (await published(page)).camera?.id;

  // Act / Assert: once running, the processed track is sent instead.
  await setEffect(page, "test-pass", true);
  await expect
    .poll(() => state(page).then((s) => s.local.cameraHold))
    .toBeNull();
  await expect
    .poll(() => published(page).then((p) => p.camera?.id))
    .not.toBe(raw);
  expect((await published(page)).camera).toBeTruthy();

  // Frames stop: the camera is taken off, raw video is not sent instead.
  await page.evaluate(() => {
    window.harness?.pipeline?.stallVideo(true);
  });
  await expect
    .poll(() => state(page).then((s) => s.local.cameraHold))
    .toBe("effect-stalled");
  await expect
    .poll(() => published(page).then((p) => p.camera))
    .toBeUndefined();

  // Frames again: the processed camera is back.
  await page.evaluate(() => {
    window.harness?.pipeline?.stallVideo(false);
  });
  await expect
    .poll(() => state(page).then((s) => s.local.cameraHold))
    .toBeNull();
  const processed = (await published(page)).camera?.id;
  expect(processed).toBeDefined();
  expect(processed).not.toBe(raw);

  // Turned off: the raw camera goes out again.
  await setEffect(page, "test-pass", false);
  await expect.poll(() => published(page).then((p) => p.camera?.id)).toBe(raw);
});
