import type { AVState } from "@modular-av/api";
import {
  type CDPSession,
  expect,
  type Page,
  test,
  type Worker,
} from "@playwright/test";
import type {} from "../harness/types.ts";

/**
 * The effects contract (handoff §3 "Testing per module") for video
 * effects, run in the browser tier's "camera" project: the real effect
 * with the core and the mock service, on the generated camera. It checks
 * what the core guarantees with this effect (only its frames go out, the
 * camera held otherwise) and what the effect owes (frames, a free main
 * thread, a clean end). Whether its pictures are right is the module's
 * own test.
 */
export interface VideoEffectContractOptions {
  /** Package directories the harness loads, e.g. "cam-background". */
  readonly modules: string;
  /** The effects' ids, all of one exclusive group. */
  readonly effects: readonly string[];
  /** A module file path prefix to fail, so the effects can't load. */
  readonly brokenFiles: string;
  /** Part of its worker script's URL, if it runs in one. */
  readonly worker?: string;
  /** Frames per second it must send at least, on this machine. */
  readonly minFps: number;
}

/** Most of the page's main thread an effect may take (handoff §9). */
export const MAIN_THREAD_BUDGET = 0.15;
/** Longest main-thread task allowed, while starting too (handoff §9). */
export const LONG_TASK_MS = 50;
const START_TIMEOUT_MS = 30_000;
/** How often what is sent is sampled. */
const SAMPLE_MS = 20;
/**
 * Longest the camera may be held while an effect of the group replaces
 * another: in software WebGL (headless Chromium) the new one starting
 * starves the old one for a few seconds.
 */
export const MAX_SWAP_HOLD_MS = 5_000;
const BROKEN_COOKIE = "mav-broken";

interface ApiLike {
  state: { get(): AVState };
  commands: {
    setEffectEnabled(id: string, on: boolean): Promise<void>;
    setVideoEnabled(on: boolean): Promise<void>;
  };
}

declare global {
  interface Window {
    /** The core's API, as the contract's page scripts use it. */
    videoContractApi?: () => ApiLike;
    /** Every id the camera was sent as, sampled every 20 ms (null: none). */
    videoContractSent?: (string | null)[];
    videoContractLongTasks?: number[];
  }
}

/** Opens the harness with the effect's module; returns the raw camera's id. */
async function open(
  page: Page,
  options: VideoEffectContractOptions,
): Promise<string> {
  await page.goto(`/?module=${options.modules}&service=mock`);
  await page.waitForFunction(() => window.harness !== undefined);
  await page.evaluate(() => {
    window.videoContractApi = () => {
      const api = window.harness?.client.game.modules.get("modular-av")?.api;
      if (!api) throw new Error("no core API");
      return api as ApiLike;
    };
    window.videoContractLongTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.videoContractLongTasks?.push(e.duration);
    }).observe({ type: "longtask" });
  });
  await expect.poll(() => sentId(page)).toBeTruthy();
  return (await sentId(page)) ?? "";
}

const sentId = (page: Page): Promise<string | null> =>
  page.evaluate(() => window.harness?.pipeline?.published().camera?.id ?? null);

/** Samples what is sent every 20 ms from now on. */
const recordSent = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const sent: (string | null)[] = [];
    window.videoContractSent = sent;
    setInterval(() => {
      sent.push(window.harness?.pipeline?.published().camera?.id ?? null);
    }, 20); // SAMPLE_MS
  });

const sentSoFar = async (page: Page): Promise<(string | null)[]> =>
  (await page.evaluate(() => window.videoContractSent)) ?? [];

const local = (page: Page): Promise<AVState["local"]> =>
  page.evaluate(() => {
    const api = window.videoContractApi?.();
    if (!api) throw new Error("no core API");
    return api.state.get().local;
  });

const statusOf = async (page: Page, id: string): Promise<string | undefined> =>
  (await local(page)).effects[id]?.status;

const setEffect = (page: Page, id: string, on: boolean): Promise<void> =>
  page.evaluate(
    ({ effect, enabled }) =>
      window.videoContractApi?.().commands.setEffectEnabled(effect, enabled),
    { effect: id, enabled: on },
  );

const running = async (page: Page, id: string): Promise<void> => {
  await expect
    .poll(() => statusOf(page, id), { timeout: START_TIMEOUT_MS })
    .toBe("running");
  await expect.poll(async () => (await local(page)).cameraHold).toBeNull();
};

/** Frames per second of what is sent, counted for `ms`. */
const sentFps = (page: Page, ms: number): Promise<number> =>
  page.evaluate(async (duration) => {
    type Processor = new (init: { track: MediaStreamTrack }) => {
      readable: ReadableStream<{ close(): void }>;
    };
    const track = window.harness?.pipeline?.track("camera");
    if (!track) throw new Error("nothing sent");
    const Processor = (
      globalThis as unknown as { MediaStreamTrackProcessor: Processor }
    ).MediaStreamTrackProcessor;
    const clone = track.clone();
    const reader = new Processor({ track: clone }).readable.getReader();
    let frames = 0;
    const until = performance.now() + duration;
    while (performance.now() < until) {
      const { value, done } = await reader.read();
      if (done) break;
      value.close();
      frames += 1;
    }
    await reader.cancel();
    clone.stop();
    return frames / (duration / 1000);
  }, ms);

/** The main thread's busy share over `ms` (CDP's TaskDuration). */
async function busyShare(
  cdp: CDPSession,
  page: Page,
  ms: number,
): Promise<number> {
  const task = async (): Promise<number> => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return metrics.find((m) => m.name === "TaskDuration")?.value ?? 0;
  };
  const before = await task();
  const started = Date.now();
  await page.waitForTimeout(ms);
  return ((await task()) - before) / ((Date.now() - started) / 1000);
}

const longTasks = async (page: Page): Promise<number[]> =>
  (await page.evaluate(() => window.videoContractLongTasks?.splice(0))) ?? [];

function effectWorker(page: Page, options: VideoEffectContractOptions): Worker {
  const part = options.worker ?? "";
  const found = page.workers().find((w) => part && w.url().includes(part));
  if (!found) throw new Error(`no worker at ${part}`);
  return found;
}

/** Chrome's warning for a frame nobody closed: a leak per frame. */
const UNCLOSED_FRAME =
  /VideoFrame was garbage collected without having been closed/i;

function runsTests(options: VideoEffectContractOptions): void {
  for (const id of options.effects) {
    test(`${id} runs: only its frames are sent, at ${String(options.minFps)} fps or more`, async ({
      page,
    }) => {
      // Arrange
      const raw = await open(page, options);
      await recordSent(page);

      // Act
      await setEffect(page, id, true);
      await running(page, id);

      // Assert
      const sent = await sentId(page);
      expect(sent).toBeTruthy();
      expect(sent).not.toBe(raw);
      expect(await sentSoFar(page)).not.toContain(raw);
      const fps = await sentFps(page, 3000);
      test.info().annotations.push({
        type: "fps",
        description: `${id}: ${fps.toFixed(1)}`,
      });
      expect(fps).toBeGreaterThanOrEqual(options.minFps);
    });

    test(`${id} keeps the page's main thread free`, async ({ page }) => {
      // Arrange
      await open(page, options);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      const baseline = await busyShare(cdp, page, 3000);
      await longTasks(page);

      // Act
      await setEffect(page, id, true);
      await running(page, id);
      await page.waitForTimeout(1000);
      const share = (await busyShare(cdp, page, 5000)) - baseline;

      // Assert
      const tasks = await longTasks(page);
      test.info().annotations.push({
        type: "main thread",
        description: `${id}: ${(share * 100).toFixed(1)}%, longest task ${String(Math.round(Math.max(0, ...tasks)))} ms`,
      });
      expect(share).toBeLessThanOrEqual(MAIN_THREAD_BUDGET);
      expect(tasks.filter((d) => d > LONG_TASK_MS)).toEqual([]);
    });
  }
}

function failClosedTests(options: VideoEffectContractOptions): void {
  const [first, second] = options.effects;
  if (!first) throw new Error("no effects");

  test("fails closed when its files can't load: the camera is held, never sent raw", async ({
    page,
    context,
    baseURL,
  }) => {
    // Arrange: the worker's own requests fail too (by cookie).
    await context.addCookies([
      {
        name: BROKEN_COOKIE,
        value: encodeURIComponent(options.brokenFiles),
        url: baseURL ?? "",
      },
    ]);
    const raw = await open(page, options);
    await recordSent(page);

    // Act
    await setEffect(page, first, true);

    // Assert
    await expect
      .poll(() => statusOf(page, first), { timeout: START_TIMEOUT_MS })
      .toBe("failed");
    expect((await local(page)).cameraHold).toBe("effect-failed");
    expect(await sentId(page)).toBeNull();
    expect(await sentSoFar(page)).not.toContain(raw);
  });

  if (second)
    test("swaps within its group without sending the raw camera", async ({
      page,
    }) => {
      const raw = await open(page, options);
      await setEffect(page, first, true);
      await running(page, first);
      await recordSent(page);

      await setEffect(page, second, true);
      await running(page, second);
      await page.waitForTimeout(500);

      // The camera may be held while the new one starts beside the old
      // (they share the GPU), never sent raw.
      const sent = await sentSoFar(page);
      const held = sent.filter((id) => id === null).length * SAMPLE_MS;
      test.info().annotations.push({
        type: "swap",
        description: `camera held for ${String(held)} ms`,
      });
      expect(sent).not.toContain(raw);
      expect(held).toBeLessThanOrEqual(MAX_SWAP_HOLD_MS);
      expect(await statusOf(page, first)).toBe("off");
    });

  test("keeps running across a camera restart, never sending it raw", async ({
    page,
  }) => {
    // Arrange
    const raw = await open(page, options);
    await setEffect(page, first, true);
    await running(page, first);
    const processed = await sentId(page);
    await recordSent(page);

    // Act: hidden, the camera is released; shown, captured again.
    await page.evaluate(() =>
      window.videoContractApi?.().commands.setVideoEnabled(false),
    );
    await expect.poll(() => sentId(page)).toBeNull();
    await page.evaluate(() =>
      window.videoContractApi?.().commands.setVideoEnabled(true),
    );

    // Assert: the same effect (its output track) runs on the new camera.
    await expect.poll(() => sentId(page), { timeout: 5000 }).toBe(processed);
    expect(await statusOf(page, first)).toBe("running");
    expect(await sentSoFar(page)).not.toContain(raw);
  });

  test("lets go of everything when turned off, and sends the camera again", async ({
    page,
  }) => {
    // Arrange
    const unclosed: string[] = [];
    page.on("console", (m) => {
      if (UNCLOSED_FRAME.test(m.text())) unclosed.push(m.text());
    });
    await open(page, options);
    await setEffect(page, first, true);
    await running(page, first);
    await page.waitForTimeout(2000);

    // Act
    await setEffect(page, first, false);

    // Assert
    await expect.poll(() => statusOf(page, first)).toBe("off");
    await expect.poll(async () => (await local(page)).cameraHold).toBeNull();
    expect(await sentId(page)).toBeTruthy();
    if (options.worker) {
      const part = options.worker;
      await expect
        .poll(
          () => page.workers().filter((w) => w.url().includes(part)).length,
          {
            timeout: 5000,
          },
        )
        .toBe(0);
    }
    // Frames nobody closed are reported when collected.
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 1000)),
    );
    expect(unclosed).toEqual([]);
  });
}

function workerTests(options: VideoEffectContractOptions): void {
  const [first] = options.effects;
  if (!first || !options.worker) return;

  test("holds the camera while its worker stalls, and sends again after", async ({
    page,
  }) => {
    // Arrange
    const raw = await open(page, options);
    await setEffect(page, first, true);
    await running(page, first);
    await recordSent(page);

    // Act: the worker is busy for 3 s (as a long GC pause or a slow GPU).
    const busy = effectWorker(page, options).evaluate(() => {
      const until = Date.now() + 3000;
      while (Date.now() < until) {
        // Busy.
      }
    });
    await expect
      .poll(async () => (await local(page)).cameraHold, { timeout: 3000 })
      .toBe("effect-stalled");
    expect(await sentId(page)).toBeNull();
    await busy;

    // Assert
    await expect.poll(async () => (await local(page)).cameraHold).toBeNull();
    expect(await statusOf(page, first)).toBe("running");
    expect(await sentSoFar(page)).not.toContain(raw);
  });

  test("fails closed when its worker dies quietly", async ({ page }) => {
    const raw = await open(page, options);
    await setEffect(page, first, true);
    await running(page, first);
    await recordSent(page);

    await effectWorker(page, options)
      .evaluate(() => {
        self.close();
      })
      .catch(() => undefined);

    await expect
      .poll(() => statusOf(page, first), { timeout: 15_000 })
      .toBe("failed");
    expect((await local(page)).cameraHold).toBe("effect-failed");
    expect(await sentSoFar(page)).not.toContain(raw);
  });
}

export function videoEffectContract(options: VideoEffectContractOptions): void {
  test.describe(`video effects contract: ${options.modules}`, () => {
    runsTests(options);
    failClosedTests(options);
    workerTests(options);
  });
}
