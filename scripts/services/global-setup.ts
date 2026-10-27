import { startCoturn } from "./coturn.ts";
import { startJitsi } from "./jitsi.ts";
import { startLiveKit } from "./livekit.ts";

/** Playwright global setup for the service and Foundry suites: returns the teardown. */
export default async function setup(): Promise<() => Promise<void>> {
  const stops = await Promise.all([
    startLiveKit(),
    startCoturn(),
    startJitsi(),
  ]);
  return async () => {
    await Promise.all(stops.map((stop) => stop()));
  };
}
