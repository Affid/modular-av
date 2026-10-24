import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import {
  FAKE_SPEECH_WAV,
  writeFakeSpeech,
} from "./scripts/foundry/fake-speech.ts";

// Written once: workers load this config too, while Chrome reads the file.
if (!existsSync(FAKE_SPEECH_WAV)) writeFakeSpeech();

/**
 * End to end in the local Foundry world (`pnpm test:foundry`): Foundry must
 * be running with the test world (`pnpm foundry:start`, `pnpm foundry:setup`)
 * and the modules built and linked. LiveKit runs in Docker.
 */
export default defineConfig({
  testDir: "tests/foundry",
  testMatch: "*.spec.ts",
  outputDir: "test-results/foundry-e2e",
  globalSetup: "./scripts/services/global-setup.ts",
  forbidOnly: true,
  workers: 1,
  // Foundry renders its canvas without a GPU here: with three pages open,
  // loading them and a busy GM page answering token requests can take
  // 100 s or more (measured the same on main in milestone 3).
  timeout: 180_000,
  // Joins wait for token relay retries (every 10 s) and Foundry's own load.
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    // Traces record evaluated arguments: no secrets in test-results/.
    trace: process.env.MAV_LIVEKIT === "cloud" ? "off" : "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        // 1.5 s of tone, 1.5 s of silence: speech, for the voice gate.
        `--use-file-for-fake-audio-capture=${FAKE_SPEECH_WAV}`,
      ],
    },
  },
});
