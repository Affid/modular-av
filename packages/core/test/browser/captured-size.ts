import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { VideoResolution } from "@modular-av/api";
import type { createBrowserMediaEnv as CreateEnv } from "../../src/media/browser-env.ts";

const ENV_MODULE = `/@fs${join(import.meta.dirname, "..", "..", "src", "media", "browser-env.ts")}`;

/** The size the real browser env captures Chrome's camera at. */
export async function capturedSize(
  page: Page,
  resolution: VideoResolution,
): Promise<string> {
  await page.goto("/?module=core");
  return page.evaluate(
    async ({ modulePath, wanted }) => {
      const { createBrowserMediaEnv } = (await import(modulePath)) as {
        createBrowserMediaEnv: typeof CreateEnv;
      };
      const env = createBrowserMediaEnv((path) => path);
      const track = await env.captureVideo("default", { resolution: wanted });
      const { width, height } = track.getSettings();
      track.stop();
      return `${String(width)}x${String(height)}`;
    },
    { modulePath: ENV_MODULE, wanted: resolution },
  );
}
