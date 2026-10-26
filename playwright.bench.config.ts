import { defineConfig } from "@playwright/test";

/**
 * Measurements, not tests (`pnpm bench:camera`): never part of `verify`.
 * With MAV_CDP=http://localhost:9222 they drive Windows Chrome with its GPU
 * over its debugging port; otherwise headless Chromium. Windows reaches
 * WSL's servers only over IPv4, hence a harness on 127.0.0.1 of its own.
 */
const BENCH_URL = "http://127.0.0.1:5175";

export default defineConfig({
  testDir: "packages",
  testMatch: "*/test/browser/**/*.bench.ts",
  outputDir: "test-results/bench-runs",
  workers: 1,
  timeout: 600_000,
  reporter: [["list"]],
  use: { baseURL: BENCH_URL },
  webServer: {
    command:
      "pnpm exec vite --config packages/testing/src/harness/vite.config.ts --host 127.0.0.1 --port 5175",
    url: BENCH_URL,
    reuseExistingServer: true,
  },
});
