import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { createBrowserMediaEnv as CreateEnv } from "../../src/media/browser-env.ts";

const ENV_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-env.ts")}`;

interface Shared {
  readonly hint: string;
  readonly height: number;
  readonly frameRate: number;
  readonly audio: boolean;
  readonly error: string | null;
}

declare global {
  interface Window {
    shared?: Promise<Shared>;
  }
}

test("a click opens the picker and shares a screen sized for reading", async ({
  page,
}) => {
  // Arrange: a button that shares, as the dock's does, from the click.
  await page.goto("/?module=core");
  await page.evaluate(async (modulePath) => {
    const { createBrowserMediaEnv } = (await import(modulePath)) as {
      createBrowserMediaEnv: typeof CreateEnv;
    };
    const env = createBrowserMediaEnv((path) => path);
    const button = document.createElement("button");
    button.textContent = "Share";
    button.addEventListener("click", () => {
      window.shared = env.captureDisplay({ audio: false }).then(
        ({ video, audio }) => {
          const settings = video.getSettings();
          video.stop();
          return {
            hint: video.contentHint,
            height: settings.height ?? 0,
            frameRate: settings.frameRate ?? 0,
            audio: audio !== null,
            error: null,
          };
        },
        (error: unknown) => ({
          hint: "",
          height: 0,
          frameRate: 0,
          audio: false,
          error: error instanceof Error ? error.name : String(error),
        }),
      );
    });
    document.body.append(button);
  }, ENV_MODULE);

  // Act
  await page.getByRole("button", { name: "Share" }).click();
  const shared = await page.evaluate(() => window.shared);

  // Assert
  expect(shared?.error).toBeNull();
  expect(shared?.hint).toBe("detail");
  expect(shared?.height).toBeGreaterThan(0);
  expect(shared?.height).toBeLessThanOrEqual(1080);
  expect(shared?.frameRate).toBeLessThanOrEqual(15);
  expect(shared?.audio).toBe(false);
});
