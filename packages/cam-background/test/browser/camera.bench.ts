import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Browser,
  type CDPSession,
  chromium,
  type Page,
  test,
} from "@playwright/test";
import {
  FAKE_CAMERA_Y4M,
  writeFakeCamera,
} from "../../../../scripts/foundry/fake-camera.ts";
import type {} from "@modular-av/testing/harness";
import type { BenchApi, Quality, Where } from "./bench-page.ts";

/**
 * Worker against main thread at a capped rate, for both models: the
 * main thread's busy share (CDP's TaskDuration, less the camera video's
 * own), long tasks, frames sent, and time per segmentation and per frame.
 * Writes test-results/bench/<browser>.json and a screenshot per run.
 */
const OUT = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "test-results",
  "bench",
);
const WARM_MS = 3_000;
const MEASURE_MS = 10_000;

declare global {
  interface Window {
    bench?: BenchApi;
  }
}

/** The fake camera as VP8, which every Chromium build plays. */
function cameraVideo(): string {
  const webm = FAKE_CAMERA_Y4M.replace(/\.y4m$/, ".webm");
  if (!existsSync(FAKE_CAMERA_Y4M)) writeFakeCamera();
  if (!existsSync(webm))
    execFileSync("ffmpeg", [
      ...["-loglevel", "error", "-y", "-i", FAKE_CAMERA_Y4M],
      ...["-c:v", "libvpx", "-b:v", "3M", "-auto-alt-ref", "0", webm],
    ]);
  return webm;
}

/** One session per page: enabling metrics anew starts them from zero. */
const sessions = new WeakMap<Page, CDPSession>();

async function taskSeconds(page: Page): Promise<number> {
  let cdp = sessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    sessions.set(page, cdp);
  }
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "TaskDuration")?.value ?? 0;
}

/** Main-thread busy share over `ms`, and the long tasks in it. */
async function busy(
  page: Page,
  ms: number,
): Promise<{ share: number; longTasks: number[] }> {
  await page.evaluate(() => window.bench?.takeLongTasks());
  const before = await taskSeconds(page);
  const started = Date.now();
  await page.waitForTimeout(ms);
  const after = await taskSeconds(page);
  const wall = (Date.now() - started) / 1000;
  const longTasks =
    (await page.evaluate(() => window.bench?.takeLongTasks())) ?? [];
  return { share: (after - before) / wall, longTasks };
}

interface Stats {
  frames: number;
  segmentations: number;
  segmentMs: number;
  drawMs: number;
  captureMs: number;
  sendMs: number;
  dropped: number;
}

const stats = (page: Page): Promise<Stats> =>
  page.evaluate(() => window.bench?.stats()) as Promise<Stats>;

async function open(
  browser: Browser,
  baseURL: string,
  video: string,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().startsWith("timing"))
      // eslint-disable-next-line no-console -- the bench reports in the console
      console.log("page:", m.text());
  });
  await page.goto(`${baseURL}/?module=core`);
  await page.waitForFunction(() => window.harness !== undefined);
  const benchUrl = `/@fs${join(import.meta.dirname, "bench-page.ts")}`;
  await page.evaluate(async (url) => {
    await import(/* @vite-ignore */ url);
  }, benchUrl);
  await page.evaluate((src) => window.bench?.playCamera(src), `/@fs${video}`);
  return page;
}

test("camera background: worker against main thread, both models", async ({
  baseURL,
}) => {
  if (!baseURL) throw new Error("no baseURL");
  const cdp = process.env.MAV_CDP;
  const browser = cdp
    ? await chromium.connectOverCDP(cdp)
    : await chromium.launch();
  const name = cdp ? "gpu-chrome" : "headless-chromium";
  mkdirSync(OUT, { recursive: true });
  // Another video, e.g. of a real person, to compare how the models look.
  const video = process.env.MAV_BENCH_VIDEO ?? cameraVideo();
  const results: Record<string, unknown>[] = [];
  try {
    const page = await open(browser, baseURL, video);
    const baseline = await busy(page, 5_000);
    // eslint-disable-next-line no-console -- the bench reports in the console
    console.log(
      `${name} baseline (camera video only): ${(baseline.share * 100).toFixed(1)}%`,
    );
    const qualities = (process.env.MAV_BENCH_QUALITY ?? "standard,high").split(
      ",",
    ) as Quality[];
    for (const quality of qualities)
      for (const where of ["worker", "main"] as Where[]) {
        await page.evaluate(() => window.bench?.takeLongTasks());
        const startMs = await page.evaluate((o) => window.bench?.start(o), {
          where,
          quality,
          mode: "blur" as const,
        });
        const startTasks =
          (await page.evaluate(() => window.bench?.takeLongTasks())) ?? [];
        await page.waitForTimeout(WARM_MS);
        const s0 = await stats(page);
        const measured = await busy(page, MEASURE_MS);
        const s1 = await stats(page);
        await page.locator("#bench-output").screenshot({
          path: join(
            OUT,
            `${name}-${where}-${quality}${process.env.MAV_BENCH_VIDEO ? "-video" : ""}.png`,
          ),
        });
        await page.evaluate(() => {
          window.bench?.stop();
        });
        const frames = s1.frames - s0.frames;
        const segs = s1.segmentations - s0.segmentations;
        const row = {
          browser: name,
          where,
          quality,
          startMs: Math.round(startMs ?? 0),
          longestStartTaskMs: Math.round(Math.max(0, ...startTasks)),
          mainThreadPct: +((measured.share - baseline.share) * 100).toFixed(1),
          longTasksOver50: measured.longTasks.filter((d) => d > 50).length,
          longestTaskMs: Math.round(Math.max(0, ...measured.longTasks)),
          fps: +(frames / (MEASURE_MS / 1000)).toFixed(1),
          segmentationsPerS: +(segs / (MEASURE_MS / 1000)).toFixed(1),
          msPerSegmentation: +(
            (s1.segmentMs - s0.segmentMs) /
            Math.max(1, segs)
          ).toFixed(2),
          msPerFrameDraw: +(
            (s1.drawMs - s0.drawMs) /
            Math.max(1, frames)
          ).toFixed(2),
          msPerFrameCapture: +(
            (s1.captureMs - s0.captureMs) /
            Math.max(1, frames)
          ).toFixed(2),
          msPerFrameSend: +(
            (s1.sendMs - s0.sendMs) /
            Math.max(1, frames)
          ).toFixed(2),
        };
        // eslint-disable-next-line no-console -- the bench reports in the console
        console.log(JSON.stringify(row));
        results.push(row);
        await page.waitForTimeout(1_000);
      }
    writeFileSync(
      join(OUT, `${name}${process.env.MAV_BENCH_VIDEO ? "-video" : ""}.json`),
      `${JSON.stringify({ baseline: baseline.share, results }, null, 2)}\n`,
    );
    await page.context().close();
  } finally {
    await browser.close();
  }
});
