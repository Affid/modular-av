import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import {
  FAKE_VOICE_WAV,
  writeFakeVoice,
} from "./scripts/foundry/fake-speech.ts";

// Written once: workers load this config too, while Chrome reads the file.
if (!existsSync(FAKE_VOICE_WAV)) writeFakeVoice();

const FAKE_MEDIA = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
];

// IPv6 loopback only: under WSL's mirrored networking a connection to an
// unused port on 127.0.0.1 times out after about two minutes instead of
// being refused, which stalled Playwright's "already running?" check.
const HARNESS_URL = "http://[::1]:5174";

export default defineConfig({
  testDir: "packages",
  testMatch: "*/test/browser/**/*.spec.ts",
  outputDir: "test-results/browser",
  fullyParallel: true,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: HARNESS_URL,
    trace: "retain-on-failure",
    permissions: ["camera", "microphone"],
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "*/test/browser/**/*.effects.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: FAKE_MEDIA },
      },
    },
    {
      // Noise models need a microphone that never goes quiet (see
      // writeFakeVoice); Chrome's default one beeps once a second.
      name: "effects",
      testMatch: "*/test/browser/**/*.effects.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            ...FAKE_MEDIA,
            `--use-file-for-fake-audio-capture=${FAKE_VOICE_WAV}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command:
      "pnpm exec vite --config packages/testing/src/harness/vite.config.ts",
    url: HARNESS_URL,
    reuseExistingServer: true,
  },
});
