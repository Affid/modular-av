import type {} from "@modular-av/testing/harness";
import { audioEffectContract } from "@modular-av/testing/contract/audio-effects";
import { expect, type Page, test } from "@playwright/test";

audioEffectContract({ modules: "audio-eq", effects: ["eq"] });

const RATE = 48_000;
const LOW_HZ = 80;
const MID_HZ = 1000;
const HIGH_HZ = 8000;

/** How much the EQ raises a tone, in dB, rendered offline. */
function gainAt(page: Page, hz: number): Promise<number> {
  return page.evaluate(
    async ({ tone, rate }) => {
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
      const peak = async (through: boolean): Promise<number> => {
        const ctx = new OfflineAudioContext(1, rate, rate);
        const source = ctx.createOscillator();
        source.frequency.value = tone;
        const level = ctx.createGain();
        level.gain.value = 0.1;
        source.connect(level);
        const effect = through
          ? await api.effects.get("eq").create({ audioContext: ctx })
          : null;
        if (effect) level.connect(effect.input);
        (effect?.output ?? level).connect(ctx.destination);
        source.start();
        const output = await ctx.startRendering();
        return output
          .getChannelData(0)
          .subarray(rate / 2)
          .reduce((most, s) => Math.max(most, Math.abs(s)), 0);
      };
      return 20 * Math.log10((await peak(true)) / (await peak(false)));
    },
    { tone: hz, rate: RATE },
  );
}

async function openEq(
  page: Page,
  gains: Record<string, number>,
): Promise<void> {
  await page.goto("/?module=audio-eq&service=mock");
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate(async (bands) => {
    const { game } = window.harness?.client ?? {};
    for (const [band, value] of Object.entries(bands))
      await game?.settings.set("modular-av-audio-eq", band, value);
  }, gains);
}

test("each band moves its own part of the voice", async ({ page }) => {
  // Arrange
  await openEq(page, { low: 9, mid: -9, high: 6 });

  // Act
  const low = await gainAt(page, LOW_HZ);
  const mid = await gainAt(page, MID_HZ);
  const high = await gainAt(page, HIGH_HZ);

  // Assert
  expect(low).toBeGreaterThan(7);
  expect(mid).toBeLessThan(-7);
  expect(high).toBeGreaterThan(4);
});

test("flat, it leaves the voice as it is", async ({ page }) => {
  await openEq(page, {});

  for (const hz of [LOW_HZ, MID_HZ, HIGH_HZ])
    expect(Math.abs(await gainAt(page, hz))).toBeLessThan(0.1);
});
