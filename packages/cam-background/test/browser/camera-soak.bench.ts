import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AVState } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { chromium, expect, test } from "@playwright/test";
import {
  FAKE_CAMERA_Y4M,
  writeFakeCamera,
} from "../../../../scripts/foundry/fake-camera.ts";

/**
 * Memory over a long session (handoff §9: no growth over 2 hours), cheaply:
 * the effect runs in the harness on the generated camera while the PSS of
 * every process of the browser (renderer with the worker, GPU process) and
 * the page's JS heap are sampled. In headless Chromium WebGL runs in
 * software, so what the GPU holds is process memory and shows too.
 * MAV_SOAK_MINUTES (default 10; 120 before a release), MAV_SOAK_EFFECT.
 */
const MINUTES = Number(process.env.MAV_SOAK_MINUTES ?? "10");
const EFFECT = process.env.MAV_SOAK_EFFECT ?? "background-blur";
const SAMPLE_MS = 30_000;
/** Allocations settle in the first minutes (caches, JIT, pools). */
const WARM_UP_MINUTES = Math.min(3, MINUTES / 3);
/** Growth allowed after warm-up: 2 hours at this rate is 60 MB. */
const MAX_MB_PER_MINUTE = 0.5;
const OUT = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "test-results",
  "bench",
);

/** Each process's parent, from /proc. */
function parents(): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      // "pid (comm) state ppid …": comm may hold spaces, so after ")".
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      map.set(Number(entry), ppid);
    } catch {
      // The process ended between listing and reading.
    }
  }
  return map;
}

/**
 * Sum of PSS (kB → MB) of the browser whose command line has `marker` and
 * all its descendants (renderer with the worker, GPU process, utilities):
 * only the browser process itself names the profile.
 */
function processMb(marker: string): number {
  const roots = execFileSync("pgrep", ["-f", marker], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map(Number);
  const tree = parents();
  const inTree = (pid: number): boolean => {
    for (
      let p: number | undefined = pid;
      p !== undefined && p > 1;
      p = tree.get(p)
    )
      if (roots.includes(p)) return true;
    return false;
  };
  let kb = 0;
  for (const pid of tree.keys()) {
    if (!inTree(pid)) continue;
    try {
      const rollup = readFileSync(`/proc/${String(pid)}/smaps_rollup`, "utf8");
      kb += Number(/^Pss:\s+(\d+)/m.exec(rollup)?.[1] ?? 0);
    } catch {
      // The process ended between listing and reading.
    }
  }
  return kb / 1024;
}

/** Least-squares slope of y over x. */
function slope(points: readonly { x: number; y: number }[]): number {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

test("camera background: memory stays flat while it runs", async ({
  baseURL,
}) => {
  test.setTimeout((MINUTES + 5) * 60_000);
  if (!baseURL) throw new Error("no baseURL");
  writeFakeCamera();
  const profile = mkdtempSync(join(tmpdir(), "mav-soak-"));
  const context = await chromium.launchPersistentContext(profile, {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${FAKE_CAMERA_Y4M}`,
    ],
    permissions: ["camera", "microphone"],
  });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/?module=cam-background&service=mock`);
    await page.waitForFunction(() => window.harness !== undefined);
    await page.evaluate(
      (id) =>
        (
          window.harness?.client.game.modules.get("modular-av")?.api as {
            commands: {
              setEffectEnabled(i: string, on: boolean): Promise<void>;
            };
          }
        ).commands.setEffectEnabled(id, true),
      EFFECT,
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            (id) =>
              (
                window.harness?.client.game.modules.get("modular-av")?.api as {
                  state: { get(): AVState };
                }
              ).state.get().local.effects[id]?.status,
            EFFECT,
          ),
        { timeout: 60_000 },
      )
      .toBe("running");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const samples: { minute: number; processMb: number; heapMb: number }[] = [];
    const started = Date.now();
    while (Date.now() - started < MINUTES * 60_000) {
      await page.waitForTimeout(SAMPLE_MS);
      await cdp.send("HeapProfiler.collectGarbage");
      const { metrics } = await cdp.send("Performance.getMetrics");
      const heap = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
      const sample = {
        minute: (Date.now() - started) / 60_000,
        processMb: processMb(profile),
        heapMb: heap / 1024 / 1024,
      };
      samples.push(sample);
      // eslint-disable-next-line no-console -- the soak reports as it goes
      console.log(JSON.stringify(sample));
    }
    const settled = samples.filter((s) => s.minute >= WARM_UP_MINUTES);
    const processRate = slope(
      settled.map((s) => ({ x: s.minute, y: s.processMb })),
    );
    const heapRate = slope(settled.map((s) => ({ x: s.minute, y: s.heapMb })));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, `soak-${EFFECT}-${String(MINUTES)}min.json`),
      `${JSON.stringify({ processRate, heapRate, samples }, null, 2)}\n`,
    );
    test.info().annotations.push({
      type: "memory",
      description: `processes ${processRate.toFixed(3)} MB/min, page heap ${heapRate.toFixed(3)} MB/min after ${String(WARM_UP_MINUTES)} min`,
    });
    expect(processRate).toBeLessThan(MAX_MB_PER_MINUTE);
    expect(heapRate).toBeLessThan(MAX_MB_PER_MINUTE);
  } finally {
    await context.close();
  }
});
