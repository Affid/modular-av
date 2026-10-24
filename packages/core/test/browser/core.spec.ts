import type {} from "@modular-av/testing/harness";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const ENV_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-env.ts")}`;

async function openHarness(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?module=core");
  await page.waitForFunction(() => window.harness !== undefined);
  expect(errors).toEqual([]);
}

test("the core starts in a browser with a fake Foundry", async ({ page }) => {
  // Arrange
  await openHarness(page);

  // Act
  const state = await page.evaluate(() => {
    const harness = window.harness;
    const api = harness?.client.game.modules.get("modular-av")?.api;
    return {
      ready: harness?.ready,
      hookErrors: harness?.client.Hooks.errors.length,
      version: (api as { version?: string } | undefined)?.version,
      frozen: api !== undefined && Object.isFrozen(api),
    };
  });

  // Assert
  expect(state).toEqual({
    ready: true,
    hookErrors: 0,
    version: "0.0.0-harness",
    frozen: true,
  });
});

test("fake devices give live microphone and camera tracks", async ({
  page,
}) => {
  await openHarness(page);

  const tracks = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const result = stream
      .getTracks()
      .map((t) => ({ kind: t.kind, state: t.readyState }));
    stream.getTracks().forEach((t) => {
      t.stop();
    });
    return result.sort((a, b) => a.kind.localeCompare(b.kind));
  });

  expect(tracks).toEqual([
    { kind: "audio", state: "live" },
    { kind: "video", state: "live" },
  ]);
});

test("the browser environment lists the fake devices with ids", async ({
  page,
}) => {
  await openHarness(page);

  const devices = await page.evaluate(async (modulePath) => {
    const { createBrowserMediaEnv } = (await import(modulePath)) as {
      createBrowserMediaEnv: (assetUrl: (p: string) => string) => {
        listDevices(): Promise<Record<string, { id: string }[]>>;
      };
    };
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const list = await createBrowserMediaEnv((p) => p).listDevices();
    stream.getTracks().forEach((t) => {
      t.stop();
    });
    return Object.fromEntries(
      Object.entries(list).map(([kind, found]) => [
        kind,
        found.length > 0 && found.every((d) => d.id !== ""),
      ]),
    );
  }, ENV_MODULE);

  expect(devices).toEqual({
    audioInput: true,
    videoInput: true,
    audioOutput: true,
  });
});
