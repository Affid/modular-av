import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { harnessUrl } from "./packages/testing/src/harness/port.ts";
import {
  FAKE_CAMERA_Y4M,
  writeFakeCamera,
} from "./scripts/foundry/fake-camera.ts";
import {
  FAKE_VOICE_WAV,
  writeFakeVoice,
} from "./scripts/foundry/fake-speech.ts";

// Written once: workers load this config too, while Chrome reads the files.
if (!existsSync(FAKE_VOICE_WAV)) writeFakeVoice();
if (!existsSync(FAKE_CAMERA_Y4M)) writeFakeCamera();

const FAKE_MEDIA = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
];

// The harness's own port, or the one MAV_HARNESS_PORT names: a second
// checkout's tests then start a server of their own beside the first's.
const HARNESS_URL = harnessUrl(process.env);

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
      testIgnore: [
        "*/test/browser/**/*.effects.spec.ts",
        "*/test/browser/**/*.camera.spec.ts",
      ],
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
    {
      // Camera backgrounds need a person in front of the camera (see
      // writeFakeCamera); Chrome's default one shows a moving pattern.
      name: "camera",
      testMatch: "*/test/browser/**/*.camera.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            ...FAKE_MEDIA,
            `--use-file-for-fake-video-capture=${FAKE_CAMERA_Y4M}`,
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
