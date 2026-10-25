import { join } from "node:path";
import type {} from "@modular-av/testing/harness";
import { expect, test } from "@playwright/test";
import type { createBridge as CreateBridge } from "../../src/bridge.ts";

const BRIDGE_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "bridge.ts")}`;

test("the bridge carries the microphone to Krisp's track and back into the chain", async ({
  page,
}) => {
  await page.goto("/?module=core");
  await page.waitForFunction(() => window.harness !== undefined);

  const peak = await page.evaluate(async (modulePath) => {
    const { createBridge } = (await import(modulePath)) as {
      createBridge: typeof CreateBridge;
    };
    const context = new AudioContext({ sampleRate: 48_000 });
    await context.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [mic] = stream.getAudioTracks();
    if (!mic) throw new Error("no fake microphone");
    const bridge = createBridge(context);
    context.createMediaStreamSource(stream).connect(bridge.input);
    // Krisp first asks the track for a microphone's settings.
    await bridge.track.applyConstraints({
      ...bridge.track.getSettings(),
      noiseSuppression: false,
      sampleRate: 48_000,
    });
    // Krisp's place: here its output is its input.
    bridge.attach(bridge.track);
    const analyser = context.createAnalyser();
    bridge.output.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let loudest = 0;
    const until = performance.now() + 1500;
    while (performance.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      analyser.getFloatTimeDomainData(samples);
      for (const s of samples) loudest = Math.max(loudest, Math.abs(s));
    }
    bridge.dispose();
    mic.stop();
    await context.close();
    return loudest;
  }, BRIDGE_MODULE);

  expect(peak).toBeGreaterThan(0.01);
});
