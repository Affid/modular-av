import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * A TURN server for the P2P tests, local only: fixed test credentials.
 * Clients relay everything through it, so they only ever reach its port
 * 3478; it relays between its own allocations on its loopback, which is
 * why the relay sockets bind to 127.0.0.1 inside the container.
 */
export const COTURN = {
  image: "coturn/coturn:4.7.0",
  container: "modular-av-coturn-test",
  url: "turn:127.0.0.1:3478?transport=udp",
  username: "modular-av",
  password: "test-only",
} as const;

const STARTUP_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 500;
const STUN_MAGIC = 0x2112a442;
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;

async function running(): Promise<boolean> {
  try {
    const { stdout } = await run("docker", [
      "inspect",
      "--format",
      "{{.State.Running}}",
      COTURN.container,
    ]);
    return stdout.trim() === "true";
  } catch {
    // No such container.
    return false;
  }
}

/**
 * Whether it answers a STUN binding request on its UDP port: its log says
 * it started a while before it does.
 */
function ready(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const request = Buffer.alloc(20);
    request.writeUInt16BE(BINDING_REQUEST, 0);
    request.writeUInt32BE(STUN_MAGIC, 4);
    randomBytes(12).copy(request, 8);
    const done = (answered: boolean): void => {
      clearTimeout(timer);
      socket.close();
      resolve(answered);
    };
    const timer = setTimeout(() => {
      done(false);
    }, PROBE_TIMEOUT_MS);
    socket.on("message", (reply) => {
      done(reply.length >= 20 && reply.readUInt16BE(0) === BINDING_SUCCESS);
    });
    socket.on("error", () => {
      done(false);
    });
    socket.send(request, 3478, "127.0.0.1");
  });
}

/** Starts coturn in Docker unless it already runs; returns the teardown. */
export async function startCoturn(): Promise<() => Promise<void>> {
  if (await running()) return () => Promise.resolve();
  await run("docker", [
    ...["run", "--detach", "--rm", "--name", COTURN.container],
    ...["-p", "127.0.0.1:3478:3478/udp", "-p", "127.0.0.1:3478:3478/tcp"],
    COTURN.image,
    ...["-n", "--log-file=stdout", "--no-cli", "--no-tls", "--no-dtls"],
    ...["--listening-port=3478", "--fingerprint", "--lt-cred-mech"],
    ...["--realm=modular-av", `--user=${COTURN.username}:${COTURN.password}`],
    ...["--external-ip=127.0.0.1", "--relay-ip=127.0.0.1"],
    ...["--allow-loopback-peers", "--min-port=49160", "--max-port=49200"],
  ]);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!(await ready())) {
    if (Date.now() > deadline)
      throw new Error(`${COTURN.image} did not start in time`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return async () => {
    await run("docker", ["stop", COTURN.container]);
  };
}

/** Freezes the relay, so every relayed link breaks, until `end`. */
export const coturnOutage = {
  start: async (): Promise<void> => {
    await run("docker", ["pause", COTURN.container]);
  },
  end: async (): Promise<void> => {
    await run("docker", ["unpause", COTURN.container]);
  },
};
