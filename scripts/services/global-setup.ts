import { startLiveKit } from "./livekit.ts";

/** Playwright global setup for `pnpm test:services`: returns the teardown. */
export default async function setup(): Promise<() => Promise<void>> {
  return startLiveKit();
}
