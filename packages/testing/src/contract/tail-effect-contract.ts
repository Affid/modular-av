import type {
  AudioEffectDefinition,
  EffectDefinition,
  EffectHost,
  EffectHostOptions,
} from "@modular-av/api";
import { expect, type Page, test } from "@playwright/test";
import type {} from "../harness/types.ts";

/**
 * What the core can't check at runtime, for effects after the voice gate:
 * the browser tier's contract for effects after the gate, on top of
 * `effectContract`. Rendered offline, so a busy machine doesn't decide it.
 */
export interface TailEffectContractOptions {
  /** Package directories the harness loads, e.g. "my-reverb". */
  readonly modules: string;
  readonly effects: readonly string[];
  /** More of the harness URL, e.g. "&effects=test". */
  readonly query?: string;
}

/**
 * Most of one core an effect may take on silence: 2 ms/s. A reverb that
 * works on every block took about 6 ms/s on a fast desktop, one that skips
 * silence about 1.
 */
export const IDLE_BUDGET = 0.002;
/** A declared tail must end this far below the effect's peak: -60 dB. */
export const TAIL_END = 0.001;
/** Still this loud as its tail ends, it was cut short: -20 dB. */
export const TAIL_CUT_SHORT = 0.1;
/** The impulse a `send` effect may pass on at once: a reverb's first echo. */
export const DRY_LEAK = 0.25;

const IDLE_SECONDS = 10;
const BURST_START_S = 0.1;
const BURST_S = 0.2;
/** Peaks are reported per this much of the render. */
const PEAK_S = 0.01;
/** How far past a tail to listen, and what a tail's end may run over by. */
const LISTEN_PAST_S = 1;
const TAIL_MARGIN_S = 0.05;

type Fill = "silence" | "burst" | "impulse";

interface Render {
  /** Wall time, in ms, over a render without the effect. */
  readonly extraMs: number;
  /** The output's peak in each `PEAK_S`. */
  readonly peaks: readonly number[];
  readonly failures: readonly string[];
}

interface Declared {
  readonly place: string;
  readonly tail: number;
  readonly latency: number;
}

interface ApiLike {
  effects: { get(id: string): EffectDefinition | undefined };
  createEffectHost(
    context: BaseAudioContext,
    options: EffectHostOptions,
  ): EffectHost;
}

declare global {
  interface Window {
    /** Renders `seconds` of `fill` through an effect, offline. */
    renderEffect?: (id: string, seconds: number, fill: Fill) => Promise<Render>;
    /** What an effect declares. */
    declaredBy?: (id: string) => Declared;
  }
}

async function install(page: Page): Promise<void> {
  await page.evaluate(
    ({ burstStart, burst, peakS }) => {
      const RATE = 48_000;
      const api = (): ApiLike => {
        const found =
          window.harness?.client.game.modules.get("modular-av")?.api;
        if (!found) throw new Error("no core API");
        return found as unknown as ApiLike;
      };
      const signal = (ctx: OfflineAudioContext, fill: Fill): AudioBuffer => {
        const buffer = ctx.createBuffer(1, ctx.length, RATE);
        const data = buffer.getChannelData(0);
        const start = Math.round(burstStart * RATE);
        if (fill === "impulse") data[start] = 1;
        if (fill === "burst")
          for (let i = 0; i < burst * RATE; i += 1)
            data[start + i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE);
        return buffer;
      };
      const render = async (
        id: string | null,
        seconds: number,
        fill: Fill,
        failures: unknown[],
      ): Promise<{ took: number; output: AudioBuffer }> => {
        const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
        const source = ctx.createBufferSource();
        source.buffer = signal(ctx, fill);
        const fail = (error: unknown): void => {
          failures.push(error);
        };
        const definition = id
          ? (api().effects.get(id) as AudioEffectDefinition | undefined)
          : undefined;
        const effect = await definition?.create({
          audioContext: ctx as unknown as AudioContext,
          signal: new AbortController().signal,
          fail,
          host: api().createEffectHost(ctx, {
            ...(definition.tail === undefined ? {} : { tail: definition.tail }),
            fail,
          }),
        });
        source.connect(effect?.input ?? ctx.destination);
        effect?.output.connect(ctx.destination);
        source.start();
        const started = performance.now();
        const output = await ctx.startRendering();
        const took = performance.now() - started;
        effect?.dispose();
        return { took, output };
      };
      window.declaredBy = (id) => {
        const found = api().effects.get(id) as
          AudioEffectDefinition | undefined;
        if (!found) throw new Error(`no effect ${id}`);
        return {
          place: found.defaultPlace,
          tail: found.tail ?? 0,
          latency: found.latency ?? 0,
        };
      };
      window.renderEffect = async (id, seconds, fill) => {
        const failures: unknown[] = [];
        const { took, output } = await render(id, seconds, fill, failures);
        const base = await render(null, seconds, fill, failures);
        const data = output.getChannelData(0);
        const size = Math.round(peakS * RATE);
        const peaks = Array.from(
          { length: Math.ceil(data.length / size) },
          (_, block) =>
            data
              .subarray(block * size, (block + 1) * size)
              .reduce((most, s) => Math.max(most, Math.abs(s)), 0),
        );
        return {
          extraMs: took - base.took,
          peaks,
          failures: failures.map(String),
        };
      };
    },
    { burstStart: BURST_START_S, burst: BURST_S, peakS: PEAK_S },
  );
}

const render = (
  page: Page,
  id: string,
  seconds: number,
  fill: Fill,
): Promise<Render> =>
  page.evaluate(
    (args) => {
      if (!window.renderEffect) throw new Error("not installed");
      return window.renderEffect(args.id, args.seconds, args.fill);
    },
    { id, seconds, fill },
  );

/** Opens the harness for offline renders; see the checks below. */
export async function openEffects(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.harness !== undefined);
  await install(page);
}

const definitionOf = (page: Page, id: string): Promise<Declared> =>
  page.evaluate((effect) => {
    if (!window.declaredBy) throw new Error("not installed");
    return window.declaredBy(effect);
  }, id);

/** Of one core, on silence, best of three. */
export async function idleShare(page: Page, id: string): Promise<number> {
  const runs: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const { extraMs } = await render(page, id, IDLE_SECONDS, "silence");
    runs.push(extraMs / (IDLE_SECONDS * 1000));
  }
  return Math.min(...runs);
}

export interface TailCheck {
  readonly peak: number;
  /** The loudest it is once its declared tail is over. */
  readonly afterTail: number;
  /** The loudest it is just before that. */
  readonly endOfTail: number;
}

export async function checkTail(page: Page, id: string): Promise<TailCheck> {
  const { tail, latency } = await definitionOf(page, id);
  const stopped = BURST_START_S + BURST_S + latency;
  const end = stopped + tail;
  const seconds = end + LISTEN_PAST_S;
  const { peaks } = await render(page, id, seconds, "burst");
  const block = (at: number): number => Math.floor(at / PEAK_S);
  const most = (from: number, to: number): number =>
    Math.max(0, ...peaks.slice(block(from), block(to)));
  return {
    peak: Math.max(...peaks),
    afterTail: most(end + TAIL_MARGIN_S, seconds),
    endOfTail: tail > 0 ? most(end - TAIL_MARGIN_S, end) : 0,
  };
}

/** The most of an impulse that comes straight out of an effect. */
export async function directPeak(page: Page, id: string): Promise<number> {
  const { latency } = await definitionOf(page, id);
  const at = BURST_START_S + latency;
  const seconds = at + LISTEN_PAST_S;
  const { peaks } = await render(page, id, seconds, "impulse");
  return peaks[Math.floor(at / PEAK_S)] ?? 0;
}

export function tailEffectContract(options: TailEffectContractOptions): void {
  const query = `module=${options.modules}&service=mock${options.query ?? ""}`;
  test.describe(`tail effects contract: ${options.modules}`, () => {
    for (const id of options.effects) {
      test(`${id} costs next to nothing on silence`, async ({ page }) => {
        await openEffects(page, query);

        const share = await idleShare(page, id);

        test.info().annotations.push({
          type: "idle",
          description: `${id}: ${(share * 100).toFixed(3)}% of one core`,
        });
        expect(share).toBeLessThanOrEqual(IDLE_BUDGET);
      });

      test(`${id} rings for as long as it says`, async ({ page }) => {
        await openEffects(page, query);

        const { peak, afterTail, endOfTail } = await checkTail(page, id);

        expect(peak).toBeGreaterThan(0);
        expect(afterTail).toBeLessThanOrEqual(peak * TAIL_END);
        expect(endOfTail).toBeLessThanOrEqual(peak * TAIL_CUT_SHORT);
      });

      test(`${id} outputs no dry signal if it is a send`, async ({ page }) => {
        await openEffects(page, query);
        const { place } = await definitionOf(page, id);
        test.skip(place !== "send", "only a send must be wet only");

        expect(await directPeak(page, id)).toBeLessThanOrEqual(DRY_LEAK);
      });
    }
  });
}
