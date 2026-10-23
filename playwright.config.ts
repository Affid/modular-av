import { defineConfig, devices } from "@playwright/test";

const HARNESS_URL = "http://localhost:5174";

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
