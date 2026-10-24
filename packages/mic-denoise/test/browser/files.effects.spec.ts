import type { AVState } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { expect, test } from "@playwright/test";

test("a model file that isn't WebAssembly fails as such, before reaching the worklet", async ({
  page,
}) => {
  // Arrange: Chrome loads RNNoise's SIMD build; the harness answers 404.
  await page.goto(
    "/?module=mic-denoise&service=mock&broken=models/rnnoise_simd",
  );
  await page.waitForFunction(() => window.harness !== undefined);
  const effect = (): Promise<AVState["local"]["effects"][string] | undefined> =>
    page.evaluate(() => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api as
        { state: { get(): AVState } } | undefined;
      return api?.state.get().local.effects.rnnoise;
    });

  // Act
  await page.evaluate(async () => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      | {
          commands: {
            setEffectEnabled(id: string, on: boolean): Promise<void>;
          };
        }
      | undefined;
    await api?.commands.setEffectEnabled("rnnoise", true);
  });

  // Assert
  await expect.poll(effect, { timeout: 15_000 }).toEqual({
    status: "failed",
    error: "CompileError",
  });
});
