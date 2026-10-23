import { defineConfig, devices } from "@playwright/test";

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
  timeout: 120_000,
  // Joins wait for token relay retries (every 10 s) and Foundry's own load.
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
