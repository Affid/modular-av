import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { createBooster as CreateBooster } from "../../src/media/browser-boost.ts";

const BOOST_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-boost.ts")}`;

interface Run {
  readonly amplitude: number;
  readonly volume: number;
  readonly muted?: boolean;
}

interface Heard {
  readonly playing: boolean;
  readonly peak: number;
}

/** Plays a 440 Hz tone through a booster for a second; the loudest sample out. */
function boost(page: Page, run: Run): Promise<Heard> {
  return page.evaluate(
    async ({ modulePath, amplitude, volume, muted }) => {
      const { createBooster } = (await import(modulePath)) as {
        createBooster: typeof CreateBooster;
      };
      const sender = new AudioContext();
      const tone = sender.createOscillator();
      const level = sender.createGain();
      level.gain.value = amplitude;
      const out = sender.createMediaStreamDestination();
      tone.connect(level).connect(out);
      tone.start();
      const [track] = out.stream.getAudioTracks();
      if (!track) throw new Error("no tone track");

      const context = new AudioContext();
      await context.resume();
      const analyser = context.createAnalyser();
      const sink = context.createGain();
      sink.gain.value = 0;
      analyser.connect(sink).connect(context.destination);
      const booster = createBooster(() => undefined, {
        context,
        destination: analyser,
      });
      const playing = booster.sync({
        ...{ track, volume, muted: muted ?? false, sinkId: "default" },
      });

      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      const until = performance.now() + 1000;
      while (performance.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        analyser.getFloatTimeDomainData(samples);
        for (const s of samples) peak = Math.max(peak, Math.abs(s));
      }
      booster.dispose();
      await Promise.all([sender.close(), context.close()]);
      return { playing, peak };
    },
    { modulePath: BOOST_MODULE, ...run },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?module=core");
});

test("doubles a quiet player", async ({ page }) => {
  const heard = await boost(page, { amplitude: 0.2, volume: 2 });

  expect(heard.playing).toBe(true);
  expect(heard.peak).toBeGreaterThan(0.35);
  expect(heard.peak).toBeLessThan(0.5);
});

test("keeps a boosted loud player under full scale", async ({ page }) => {
  const heard = await boost(page, { amplitude: 0.8, volume: 2 });

  expect(heard.peak).toBeGreaterThan(0.6);
  expect(heard.peak).toBeLessThan(1);
});

test("leaves full volume and below to the element", async ({ page }) => {
  const heard = await boost(page, { amplitude: 0.2, volume: 1 });

  expect(heard.playing).toBe(false);
  expect(heard.peak).toBeLessThan(0.001);
});

test("is silent while the player is muted", async ({ page }) => {
  const heard = await boost(page, { amplitude: 0.2, volume: 2, muted: true });

  expect(heard.peak).toBeLessThan(0.001);
});
