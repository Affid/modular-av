import type { AVState } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, type Page, test } from "@playwright/test";

/** The core with the mock service and test effects, always sending. */
async function openPipeline(page: Page): Promise<void> {
  await page.goto("/?module=core&service=mock&effects=test");
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { commands: { setVoiceMode(mode: "always"): Promise<void> } } | undefined;
    await api?.commands.setVoiceMode("always");
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.harness?.pipeline?.published().microphone),
    )
    .toBeTruthy();
}

const state = (page: Page): Promise<AVState> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      { state: { get(): AVState } } | undefined;
    if (!api) throw new Error("no api");
    return api.state.get();
  });

test("a denoise effect that sends digital silence is taken out, and the player is heard again", async ({
  page,
}) => {
  // Arrange
  await openPipeline(page);

  // Act
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      | {
          commands: {
            setEffectEnabled(id: string, on: boolean): Promise<void>;
          };
        }
      | undefined;
    await api?.commands.setEffectEnabled("test-silent", true);
  });

  // Assert
  await expect
    .poll(() => state(page).then((s) => s.local.effects["test-silent"]), {
      timeout: 10_000,
    })
    .toEqual({ status: "failed", error: "StalledError" });
  const heard = await page.evaluate(() =>
    window.harness?.pipeline?.record("microphone", 1000),
  );
  expect(heard?.peak).toBeGreaterThan(0.01);
});
