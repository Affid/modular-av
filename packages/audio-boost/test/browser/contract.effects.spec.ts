import type {} from "@modular-av/testing/harness";
import { audioEffectContract } from "@modular-av/testing/contract/audio-effects";
import { expect, type Page, test } from "@playwright/test";

audioEffectContract({ modules: "audio-boost", effects: ["boost"] });

const RATE = 48_000;

/** The loudest sample of a 1 kHz tone at `amplitude` after the boost, offline. */
function peakOut(page: Page, amplitude: number): Promise<number> {
  return page.evaluate(
    async ({ level, rate }) => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api as
        | {
            effects: {
              get(id: string): {
                create(c: {
                  audioContext: BaseAudioContext;
                }): Promise<{ input: AudioNode; output: AudioNode }>;
              };
            };
          }
        | undefined;
      if (!api) throw new Error("no core API");
      const ctx = new OfflineAudioContext(1, rate, rate);
      const source = ctx.createOscillator();
      source.frequency.value = 1000;
      const gain = ctx.createGain();
      gain.gain.value = level;
      const effect = await api.effects
        .get("boost")
        .create({ audioContext: ctx });
      source.connect(gain).connect(effect.input);
      effect.output.connect(ctx.destination);
      source.start();
      const output = await ctx.startRendering();
      // After the compressor and limiter have settled.
      return output
        .getChannelData(0)
        .subarray(rate / 2)
        .reduce((most, s) => Math.max(most, Math.abs(s)), 0);
    },
    { level: amplitude, rate: RATE },
  );
}

async function openBoost(
  page: Page,
  values: { boost?: number; evenness?: number },
): Promise<void> {
  await page.goto("/?module=audio-boost&service=mock");
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate(async (settings) => {
    const { game } = window.harness?.client ?? {};
    for (const [key, value] of Object.entries(settings))
      await game?.settings.set("modular-av-audio-boost", key, value);
  }, values);
}

const db = (ratio: number): number => 20 * Math.log10(ratio);

test("raises a quiet microphone by the boost", async ({ page }) => {
  await openBoost(page, { boost: 12, evenness: 0 });

  const gain = db((await peakOut(page, 0.02)) / 0.02);

  expect(gain).toBeGreaterThan(10);
  expect(gain).toBeLessThan(14);
});

test("never sends a boosted shout past full scale", async ({ page }) => {
  await openBoost(page, { boost: 24, evenness: 1 });

  expect(await peakOut(page, 0.9)).toBeLessThan(1);
});

test("evening out brings loud and quiet speech closer", async ({ page }) => {
  // Arrange
  const spread = async (): Promise<number> =>
    db((await peakOut(page, 0.5)) / (await peakOut(page, 0.01)));

  // Act
  await openBoost(page, { boost: 0, evenness: 0 });
  const plain = await spread();
  await openBoost(page, { boost: 0, evenness: 1 });
  const evened = await spread();

  // Assert: 34 dB apart going in.
  expect(plain).toBeGreaterThan(33);
  expect(evened).toBeLessThan(plain - 10);
});
