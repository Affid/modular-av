import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readEnv } from "../foundry/env.ts";

const run = promisify(execFile);

/** `livekit-server --dev`: well-known keys, for local tests only. */
export const LIVEKIT_DEV = {
  image: "livekit/livekit-server:v1.13.8",
  container: "modular-av-livekit-test",
  url: "ws://127.0.0.1:7880",
  health: "http://127.0.0.1:7880",
  apiKey: "devkey",
  apiSecret: "secret",
} as const;

const STARTUP_TIMEOUT_MS = 30_000;

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(LIVEKIT_DEV.health)).ok;
  } catch {
    // Not listening yet.
    return false;
  }
}

/** Where the LiveKit tests run: Docker by default, Cloud with MAV_LIVEKIT=cloud. */
export interface LiveKitTarget {
  readonly cloud: boolean;
  readonly url: string;
  readonly apiKey: string;
  readonly apiSecret: string;
}

export const usesCloud = (): boolean => process.env.MAV_LIVEKIT === "cloud";

/**
 * The server to test against. Cloud credentials come from `.env.local`
 * (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) and are never printed.
 */
export function livekitTarget(): LiveKitTarget {
  if (!usesCloud())
    return {
      cloud: false,
      url: LIVEKIT_DEV.url,
      apiKey: LIVEKIT_DEV.apiKey,
      apiSecret: LIVEKIT_DEV.apiSecret,
    };
  const url = readEnv("LIVEKIT_URL");
  const apiKey = readEnv("LIVEKIT_API_KEY");
  const apiSecret = readEnv("LIVEKIT_API_SECRET");
  if (!url || !apiKey || !apiSecret)
    throw new Error(
      "MAV_LIVEKIT=cloud needs LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local",
    );
  return { cloud: true, url, apiKey, apiSecret };
}

/**
 * Starts the dev server in Docker, unless one already answers. Docker may
 * run in a VM (Docker Desktop), so the ports are published on localhost
 * and LiveKit announces 127.0.0.1 in its ICE candidates.
 */
export async function startLiveKit(): Promise<() => Promise<void>> {
  if (usesCloud() || (await healthy())) return () => Promise.resolve();
  await run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    LIVEKIT_DEV.container,
    ...["-p", "127.0.0.1:7880:7880", "-p", "127.0.0.1:7881:7881"],
    ...["-p", "127.0.0.1:7882:7882/udp"],
    LIVEKIT_DEV.image,
    "--dev",
    ...["--bind", "0.0.0.0", "--node-ip", "127.0.0.1"],
  ]);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!(await healthy())) {
    if (Date.now() > deadline)
      throw new Error(`${LIVEKIT_DEV.image} did not start in time`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return async () => {
    await run("docker", ["stop", LIVEKIT_DEV.container]);
  };
}

/** Freezes the server, so every client loses it, until `end`. */
export const livekitOutage = {
  start: async (): Promise<void> => {
    await run("docker", ["pause", LIVEKIT_DEV.container]);
  },
  end: async (): Promise<void> => {
    await run("docker", ["unpause", LIVEKIT_DEV.container]);
  },
};
