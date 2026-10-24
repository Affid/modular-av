import { defineConfig, devices } from "@playwright/test";

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
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
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
