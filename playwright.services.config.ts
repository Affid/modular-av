import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config.ts";

const CHROMIUM = {
  ...devices["Desktop Chrome"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      // A page with camera access gathers ICE candidates per interface,
      // leaving out loopback, where the test TURN server listens.
      "--allow-loopback-in-peer-connection",
    ],
  },
};

/**
 * The service contract against real servers in Docker (`pnpm test:services`).
 * Not part of `pnpm verify`: it needs Docker and takes minutes.
 */
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    // Traces record evaluated arguments: no secrets in test-results/.
    trace: process.env.MAV_LIVEKIT === "cloud" ? "off" : "retain-on-failure",
  },
  testMatch: "*/test/service/**/*.spec.ts",
  outputDir: "test-results/services",
  globalSetup: "./scripts/services/global-setup.ts",
  timeout: 60_000,
  workers: 4,
  projects: [
    { name: "contract", use: CHROMIUM, grepInvert: /@outage/ },
    {
      name: "outage",
      use: CHROMIUM,
      grep: /@outage/,
      dependencies: ["contract"],
    },
  ],
});
