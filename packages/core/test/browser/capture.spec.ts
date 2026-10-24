import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { createBrowserCaptureContext as CreateCapture } from "../../src/media/browser-capture.ts";

const CAPTURE_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-capture.ts")}`;

interface GateRun {
  readonly sampleRate: number;
  readonly running: boolean;
  readonly transitions: readonly boolean[];
  readonly outputPeak: number;
}

/**
 * Runs Chrome's fake microphone (a beep about once a second) through the
 * real capture context and gate worklet, loaded the way Foundry serves it.
 */
async function runGate(
  page: Page,
  config: { mode: "gate" | "detect"; auto: boolean; threshold: number },
): Promise<GateRun> {
  await page.goto("/?module=core");
  await page.waitForFunction(() => window.harness !== undefined);
  return page.evaluate(
    async ({ modulePath, gateConfig }) => {
      const { createBrowserCaptureContext } = (await import(modulePath)) as {
        createBrowserCaptureContext: typeof CreateCapture;
      };
      const capture = createBrowserCaptureContext(
        (path) => `/modules/modular-av/${path}`,
      );
      await capture.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const [mic] = stream.getAudioTracks();
      if (!mic) throw new Error("no fake microphone");
      const gate = await capture.createGate(gateConfig);
      const transitions: boolean[] = [];
      gate.onTransition((open) => transitions.push(open));
      capture.createSource(mic).connect(gate.node).connect(capture.destination);

      // Listen to what would be sent.
      const listener = new AudioContext();
      const analyser = listener.createAnalyser();
      listener
        .createMediaStreamSource(new MediaStream([capture.output]))
        .connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let outputPeak = 0;
      const until = performance.now() + 3000;
      while (performance.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        analyser.getFloatTimeDomainData(samples);
        for (const s of samples) outputPeak = Math.max(outputPeak, Math.abs(s));
      }
      gate.dispose();
      mic.stop();
      await listener.close();
      return {
        sampleRate: capture.audioContext.sampleRate,
        running: capture.running,
        transitions,
        outputPeak,
      };
    },
    { modulePath: CAPTURE_MODULE, gateConfig: config },
  );
}

// The beep never reaches 0 dBFS: the gate stays closed.
const NEVER = 0;

test("the gate worklet opens on the fake microphone's beep and sends it", async ({
  page,
}) => {
  // Arrange / Act
  const run = await runGate(page, { mode: "gate", auto: true, threshold: -50 });

  // Assert
  expect(run.sampleRate).toBe(48_000);
  expect(run.running).toBe(true);
  expect(run.transitions[0]).toBe(true);
  expect(run.outputPeak).toBeGreaterThan(0.01);
});

test("a closed gate sends digital silence", async ({ page }) => {
  const run = await runGate(page, {
    mode: "gate",
    auto: false,
    threshold: NEVER,
  });

  expect(run.transitions).toEqual([]);
  expect(run.outputPeak).toBe(0);
});

test("in detect mode a closed gate still sends the microphone", async ({
  page,
}) => {
  const run = await runGate(page, {
    mode: "detect",
    auto: false,
    threshold: NEVER,
  });

  expect(run.transitions).toEqual([]);
  expect(run.outputPeak).toBeGreaterThan(0.01);
});
