import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * docker-jitsi-meet with token (JWT) authentication, for local tests only:
 * the app secret below is a fixed test value, the ports are on loopback.
 */
export const JITSI_DOCKER = {
  compose: join(import.meta.dirname, "jitsi", "compose.yml"),
  web: "http://127.0.0.1:8000",
  serviceUrl: "ws://127.0.0.1:8000/xmpp-websocket",
  domain: "meet.jitsi",
  muc: "muc.meet.jitsi",
  appId: "modular-av-test",
  appSecret: "modular-av-test-secret-not-for-production",
} as const;

const STARTUP_TIMEOUT_MS = 90_000;

const compose = (...args: string[]): Promise<{ stdout: string }> =>
  run("docker", ["compose", "-f", JITSI_DOCKER.compose, ...args]);

async function webAnswers(): Promise<boolean> {
  try {
    return (await fetch(JITSI_DOCKER.web)).ok;
  } catch {
    // Not listening yet.
    return false;
  }
}

const BRIDGE_FOUND = "Added new videobridge";

/**
 * Jicofo can place a conference once it has found the bridge. Its log is
 * read as a stream up to that line: a container kept between runs logs
 * more than execFile buffers.
 */
function bridgeReady(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const logs = spawn(
      "docker",
      ["compose", "-f", JITSI_DOCKER.compose, "logs", "--no-color", "jicofo"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let tail = "";
    logs.stdout.setEncoding("utf8");
    logs.stdout.on("data", (chunk: string) => {
      const seen = tail + chunk;
      if (seen.includes(BRIDGE_FOUND)) {
        logs.kill();
        resolve(true);
      }
      tail = seen.slice(-BRIDGE_FOUND.length);
    });
    logs.on("error", reject);
    logs.on("close", () => {
      resolve(false);
    });
  });
}

const ready = async (): Promise<boolean> =>
  (await webAnswers()) && (await bridgeReady());

/** Starts Jitsi in Docker unless it already runs; returns the teardown. */
export async function startJitsi(): Promise<() => Promise<void>> {
  if (await ready()) return () => Promise.resolve();
  await compose("up", "--detach");
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error("Jitsi did not start in time");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return async () => {
    await compose("down");
  };
}

/** Freezes every Jitsi container, so every client loses it, until `end`. */
export const jitsiOutage = {
  start: async (): Promise<void> => {
    await compose("pause");
  },
  end: async (): Promise<void> => {
    await compose("unpause");
  },
};
