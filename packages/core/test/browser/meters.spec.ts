import type { MeterReading, ModularAV } from "@modular-av/api";
import type {} from "@modular-av/testing/harness";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const METER_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-meters.ts")}`;

declare global {
  interface Window {
    readings?: MeterReading[];
    meterElement?: HTMLElement;
  }
}

async function openCall(page: Page): Promise<void> {
  await page.goto("/?module=core&service=mock");
  await page.waitForFunction(() => window.harness !== undefined);
  await page.waitForFunction(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      ModularAV | undefined;
    return api?.state.get().local.hasMicrophone === true;
  });
}

/** Shows a meter of the local player in the page. */
const subscribeSelf = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const api = window.harness?.client.game.modules.get("modular-av")?.api as
      ModularAV | undefined;
    const element = document.createElement("div");
    element.style.cssText = "width:100px;height:8px";
    document.body.append(element);
    window.meterElement = element;
    window.readings = [];
    api?.meters.subscribe(
      window.harness?.client.game.userId ?? "",
      element,
      (r) => window.readings?.push(r),
    );
  });

const count = (page: Page): Promise<number> =>
  page.evaluate(() => window.readings?.length ?? 0);

test("the local meter reports the gate's level about 20 times a second", async ({
  page,
}) => {
  await openCall(page);

  await subscribeSelf(page);
  await page.waitForTimeout(1000);

  const readings = await page.evaluate(() => window.readings ?? []);
  expect(readings.length).toBeGreaterThanOrEqual(15);
  expect(readings.length).toBeLessThanOrEqual(25);
  expect(readings.every((r) => typeof r.threshold === "number")).toBe(true);
  expect(readings.some((r) => r.db > -100)).toBe(true);
});

test("a meter scrolled out of view reports nothing", async ({ page }) => {
  await openCall(page);
  await subscribeSelf(page);
  await expect.poll(() => count(page)).toBeGreaterThan(0);

  await page.evaluate(() => {
    if (window.meterElement)
      window.meterElement.style.transform = "translateY(-5000px)";
  });
  await page.waitForTimeout(300);
  const before = await count(page);
  await page.waitForTimeout(500);

  expect(await count(page)).toBe(before);
});

test("a level meter on a played track hears the fake microphone", async ({
  page,
}) => {
  await openCall(page);

  const loudest = await page.evaluate(async (modulePath) => {
    const { createBrowserLevelMeter } = (await import(modulePath)) as {
      createBrowserLevelMeter: (track: MediaStreamTrack) => {
        read(): number;
        dispose(): void;
      };
    };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [track] = stream.getAudioTracks();
    if (!track) throw new Error("no microphone");
    const meter = createBrowserLevelMeter(track);
    let max = -100;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      max = Math.max(max, meter.read());
    }
    meter.dispose();
    track.stop();
    return max;
  }, METER_MODULE);

  expect(loudest).toBeGreaterThan(-90);
});
