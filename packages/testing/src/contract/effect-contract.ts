import type { AVState, EffectCost } from "@modular-av/api";
import { expect, type Page, test } from "@playwright/test";
import type {} from "../harness/types.ts";

/**
 * The effects contract (handoff §3 "Testing per module") for audio
 * effects, run in the browser tier's "effects" project: the real effect in
 * the core's capture context, on a fake microphone that never goes quiet.
 */
export interface EffectContractOptions {
  /** Package directories the harness loads, e.g. "mic-denoise". */
  readonly modules: string;
  /** The effects' ids, all of one exclusive group. */
  readonly effects: readonly string[];
  /** A module file path prefix to fail, so the effects can't load. */
  readonly brokenFiles: string;
}

/**
 * Most of one core's time an effect may take, by the cost it declares,
 * rendered offline. About twice what the noise models took on a fast
 * desktop (handoff §14), so a label that lies fails, not a busy machine.
 */
export const COST_BUDGETS: Readonly<Record<EffectCost, number>> = {
  light: 0.05,
  medium: 0.12,
  heavy: 0.3,
};

/**
 * Longest silence allowed in what is sent while effects swap: a model's
 * first output (its own latency) may be silent, a gap in the chain isn't
 * allowed. 43 ms at 48 kHz.
 */
export const SWAP_GAP_SAMPLES = 2048;
const AUDIBLE = 0.01;
const RENDER_SECONDS = 10;

interface ApiLike {
  state: { get(): AVState };
  commands: {
    setEffectEnabled(id: string, on: boolean): Promise<void>;
    setVoiceMode(mode: "always"): Promise<void>;
  };
}

declare global {
  interface Window {
    /** The core's API, as the contract's page scripts use it. */
    contractApi?: () => ApiLike;
  }
}

async function open(
  page: Page,
  options: EffectContractOptions,
  extra = "",
): Promise<void> {
  await page.goto(`/?module=${options.modules}&service=mock${extra}`);
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate(async () => {
    window.contractApi = () => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api;
      if (!api) throw new Error("no core API");
      return api as ApiLike;
    };
    await window.contractApi().commands.setVoiceMode("always");
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.harness?.pipeline?.published().microphone),
    )
    .toBeTruthy();
}

const statusOf = (page: Page, id: string): Promise<string | undefined> =>
  page.evaluate(
    (effect) =>
      window.contractApi?.().state.get().local.effects[effect]?.status,
    id,
  );

const setEffect = (page: Page, id: string, on: boolean): Promise<void> =>
  page.evaluate(
    ({ effect, enabled }) =>
      window.contractApi?.().commands.setEffectEnabled(effect, enabled),
    { effect: id, enabled: on },
  );

const peakSent = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const recording = await window.harness?.pipeline?.record(
      "microphone",
      1000,
    );
    return recording?.peak ?? 0;
  });

interface Cost {
  /** Of one core, rendering 10 s offline, best of three. */
  readonly share: number;
  /** What came out, so a model that did nothing can't pass as cheap. */
  readonly rms: number;
  readonly failures: readonly string[];
}

function measureCost(page: Page, id: string): Promise<Cost> {
  return page.evaluate(
    async ({ effect, seconds }) => {
      const definition = window.harness?.client.game.modules.get("modular-av")
        ?.api as { effects: { get(id: string): unknown } } | undefined;
      const audio = definition?.effects.get(effect) as
        | {
            create(c: {
              audioContext: BaseAudioContext;
              signal: AbortSignal;
              fail: (e: unknown) => void;
            }): Promise<{
              input: AudioNode;
              output: AudioNode;
              dispose(): void;
            }>;
          }
        | undefined;
      if (!audio) throw new Error(`no effect ${effect}`);
      const failures: unknown[] = [];
      /** Wall time to render, and the output's RMS level. */
      const render = async (
        withEffect: boolean,
      ): Promise<{ took: number; rms: number }> => {
        const rate = 48_000;
        const ctx = new OfflineAudioContext(1, rate * seconds, rate);
        const buffer = ctx.createBuffer(1, rate * seconds, rate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1)
          data[i] =
            0.05 * Math.sin((2 * Math.PI * 140 * i) / rate) +
            0.01 * (Math.random() * 2 - 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const instance = withEffect
          ? await audio.create({
              audioContext: ctx,
              signal: new AbortController().signal,
              fail: (error) => failures.push(error),
            })
          : null;
        const node = instance ?? {
          input: ctx.createGain(),
          output: ctx.createGain(),
        };
        if (!instance) node.input.connect(node.output);
        source.connect(node.input);
        node.output.connect(ctx.destination);
        source.start();
        const started = performance.now();
        const rendered = await ctx.startRendering();
        const took = performance.now() - started;
        instance?.dispose();
        const out = rendered.getChannelData(0);
        let sum = 0;
        for (const sample of out) sum += sample * sample;
        return { took, rms: Math.sqrt(sum / out.length) };
      };
      let best = Infinity;
      let rms = 0;
      for (let i = 0; i < 3; i += 1) {
        const run = await render(true);
        const base = await render(false);
        best = Math.min(best, (run.took - base.took) / (seconds * 1000));
        rms = run.rms;
      }
      return { share: best, rms, failures: failures.map(String) };
    },
    { effect: id, seconds: RENDER_SECONDS },
  );
}

export function effectContract(options: EffectContractOptions): void {
  test.describe(`effects contract: ${options.modules}`, () => {
    for (const id of options.effects) {
      test(`${id} runs, and the player is still heard`, async ({ page }) => {
        await open(page, options);
        const sent = await page.evaluate(
          () => window.harness?.pipeline?.published().microphone?.id,
        );

        await setEffect(page, id, true);

        await expect
          .poll(() => statusOf(page, id), { timeout: 15_000 })
          .toBe("running");
        expect(await peakSent(page)).toBeGreaterThan(AUDIBLE);
        expect(
          await page.evaluate(
            () => window.harness?.pipeline?.published().microphone?.id,
          ),
        ).toBe(sent);
      });

      test(`${id} costs no more than it says`, async ({ page }) => {
        await open(page, options);
        const cost = await page.evaluate(
          (effect) =>
            (
              window.harness?.client.game.modules.get("modular-av")?.api as
                | {
                    effects: {
                      get(id: string): { cost: EffectCost } | undefined;
                    };
                  }
                | undefined
            )?.effects.get(effect)?.cost,
          id,
        );
        if (!cost) throw new Error(`no effect ${id}`);

        const { share, rms, failures } = await measureCost(page, id);

        test.info().annotations.push({
          type: "cost",
          description: `${id} (${cost}): ${(share * 100).toFixed(2)}% of one core, output RMS ${rms.toFixed(4)}`,
        });
        expect(failures).toEqual([]);
        expect(rms).toBeGreaterThan(0.001);
        expect(share).toBeLessThanOrEqual(COST_BUDGETS[cost]);
      });

      test(`${id} turned off leaves the chain`, async ({ page }) => {
        await open(page, options);
        await setEffect(page, id, true);
        await expect
          .poll(() => statusOf(page, id), { timeout: 15_000 })
          .toBe("running");

        await setEffect(page, id, false);

        await expect.poll(() => statusOf(page, id)).toBe("off");
        expect(await peakSent(page)).toBeGreaterThan(AUDIBLE);
      });
    }

    test("swaps within its group without a gap in what is sent", async ({
      page,
    }) => {
      // Arrange
      await open(page, options);
      const [first] = options.effects;
      if (!first) throw new Error("no effects");
      await setEffect(page, first, true);
      await expect
        .poll(() => statusOf(page, first), { timeout: 15_000 })
        .toBe("running");

      // Act: record while each effect in turn replaces the one running.
      const recording = await page.evaluate(async (ids) => {
        const api = window.contractApi?.();
        const pipeline = window.harness?.pipeline;
        if (!api || !pipeline) throw new Error("no harness");
        const recorded = pipeline.record("microphone", 1000 * (ids.length + 2));
        for (const id of [...ids.slice(1), ids[0] ?? ""]) {
          await api.commands.setEffectEnabled(id, true);
          const until = performance.now() + 10_000;
          while (
            api.state.get().local.effects[id]?.status !== "running" &&
            performance.now() < until
          )
            await new Promise((resolve) => setTimeout(resolve, 20));
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return recorded;
      }, options.effects);

      // Assert
      test.info().annotations.push({
        type: "swap",
        description: `longest silence ${String(recording.longestZeroRun)} samples`,
      });
      expect(recording.peak).toBeGreaterThan(AUDIBLE);
      expect(recording.longestZeroRun).toBeLessThan(SWAP_GAP_SAMPLES);
      expect(await statusOf(page, first)).toBe("running");
    });

    test("fails closed when its files can't load: the player is heard without it", async ({
      page,
    }) => {
      await open(page, options, `&broken=${options.brokenFiles}`);
      const [first] = options.effects;
      if (!first) throw new Error("no effects");

      await setEffect(page, first, true);

      await expect
        .poll(() => statusOf(page, first), { timeout: 15_000 })
        .toBe("failed");
      expect(await peakSent(page)).toBeGreaterThan(AUDIBLE);
    });
  });
}
