// Where the browser harness listens. One port by default, which every
// checkout on a machine shares: a second checkout (another session, a
// worktree) names its own with MAV_HARNESS_PORT, and its browser tests
// and theme pictures then run beside the first's instead of against it.

export const DEFAULT_HARNESS_PORT = 5174;

/** The environment's part this reads: `process.env` where there is one. */
export type HarnessEnv = Readonly<Record<string, string | undefined>>;

/** Ports below this need privileges to listen on. */
const LOWEST_PORT = 1024;
const HIGHEST_PORT = 65535;

/** The harness's port: MAV_HARNESS_PORT if it is set, else the default. */
export function harnessPort(env: HarnessEnv): number {
  const given = env.MAV_HARNESS_PORT;
  if (given === undefined || given === "") return DEFAULT_HARNESS_PORT;
  const port = Number(given);
  if (
    given.trim() === "" ||
    !Number.isInteger(port) ||
    port < LOWEST_PORT ||
    port > HIGHEST_PORT
  )
    throw new Error(
      `MAV_HARNESS_PORT must be a port from ${String(LOWEST_PORT)} to ${String(HIGHEST_PORT)}, not ${JSON.stringify(given)}`,
    );
  return port;
}

/**
 * The harness's address. IPv6 loopback only: under WSL's mirrored
 * networking a connection to an unused port on 127.0.0.1 times out after
 * about two minutes instead of being refused.
 */
export const harnessUrl = (env: HarnessEnv): string =>
  `http://[::1]:${String(harnessPort(env))}`;
