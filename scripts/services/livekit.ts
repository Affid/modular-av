import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

/**
 * Starts the dev server in Docker, unless one already answers. Docker may
 * run in a VM (Docker Desktop), so the ports are published on localhost
 * and LiveKit announces 127.0.0.1 in its ICE candidates.
 */
export async function startLiveKit(): Promise<() => Promise<void>> {
  if (await healthy()) return () => Promise.resolve();
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
