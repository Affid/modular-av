import type {
  MediaPermissions,
  ParticipantId,
  RoomSpec,
  ServiceConnection,
  ServiceConnectionState,
  ServiceDefinition,
  ServiceError,
  ServiceEvents,
  SessionEndReason,
  SessionState,
  SessionStatus,
} from "@modular-av/api";
import { backoffDelay, endReasonFor } from "./backoff.ts";
import {
  createPublications,
  type LocalTracks,
  type Publications,
} from "./publications.ts";

export interface SessionDeps {
  readonly participant: ParticipantId;
  service(): ServiceDefinition | undefined;
  room(): RoomSpec;
  requestToken(signal: AbortSignal): Promise<string>;
  localTracks(): LocalTracks;
  canPublish(): MediaPermissions;
  outbound(): MediaPermissions;
  /**
   * After each sync with the service: services may write `track.enabled`
   * (LiveKit's unmute does), so the core applies its own state again.
   */
  afterMediaSync(): void;
  onState(state: SessionState): void;
  /** The live connection, or null between connections. */
  onConnection(connection: ServiceConnection | null): void;
  /** Remote events of the live connection only. */
  readonly remote: Pick<
    ServiceEvents,
    | "trackAdded"
    | "trackRemoved"
    | "participantJoined"
    | "participantLeft"
    | "speaking"
    | "quality"
  >;
  onOnline(listener: () => void): () => void;
  now(): number;
  onError(error: unknown): void;
}

export interface Session {
  readonly state: SessionState;
  start(): void;
  /** `null` goes back to idle (A/V disabled); a reason ends the session. */
  stop(reason: SessionEndReason | null): Promise<void>;
  /** Reconnects now with a fresh token, e.g. after the GM changed rights. */
  restart(): void;
  /** Skips the wait while retrying. */
  retryNow(): void;
  /** The token relay found no GM who can answer, or found one again. */
  waitingForGm(waiting: boolean): void;
  /** Local tracks, rights or the outbound state changed. */
  syncMedia(): void;
}

const IDLE: SessionState = {
  status: "idle",
  attempt: 0,
  nextRetryAt: null,
  reason: null,
};

const NETWORK: ServiceError = { code: "network", final: false };

/**
 * How long a connection must hold before the backoff starts over, so a
 * server that accepts and drops at once doesn't get hammered every second.
 */
export const STABLE_AFTER_MS = 30_000;

/**
 * How long creating and joining may take once a token is in hand: nothing
 * may leave a player "connecting" forever. Counts as a network failure.
 */
export const JOIN_TIMEOUT_MS = 30_000;

class JoinTimeout extends Error {
  constructor() {
    super(`Joining took longer than ${String(JOIN_TIMEOUT_MS / 1000)} s`);
    this.name = "JoinTimeout";
  }
}

/** Rejects with the signal's reason once aborted. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(
        signal.reason instanceof Error ? signal.reason : new Error("Aborted"),
      );
    };
    if (signal.aborted) onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

/** A service's own failure carries its reason; anything else is the network. */
function serviceErrorOf(error: unknown): ServiceError {
  const candidate = (error as { serviceError?: unknown } | null)?.serviceError;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "code" in candidate &&
    "final" in candidate
  )
    return candidate as ServiceError;
  return NETWORK;
}

/** Where a start shows first: no service ends at once in `connect`. */
const firstStatus = (service: ServiceDefinition | undefined): SessionStatus =>
  service?.needsToken() === false ? "connecting" : "waiting-for-token";

interface Live {
  readonly connection: ServiceConnection;
  readonly publications: Publications;
  readonly unsubscribe: readonly (() => void)[];
}

/**
 * A connection whose token runs out gets a fresh one from the relay, one
 * request at a time; a token for a connection since replaced or ended is
 * dropped. Without a GM it never comes: the service then loses its
 * connection and the core reconnects as usual. `wanted()` says whether
 * the token (no argument) or a failure (`error`) still matters.
 */
function createTokenRefresher(
  deps: Pick<SessionDeps, "requestToken" | "onError">,
): (
  connection: ServiceConnection,
  signal: AbortSignal,
  wanted: (error?: unknown) => boolean,
) => void {
  let refreshing: ServiceConnection | null = null;
  return (connection, signal, wanted) => {
    const update = connection.updateToken?.bind(connection);
    if (!update || refreshing === connection) return;
    refreshing = connection;
    deps
      .requestToken(signal)
      .then((token) => (wanted() ? update(token) : undefined))
      .catch((error: unknown) => {
        if (wanted(error) && !isAbort(error)) deps.onError(error);
      })
      .finally(() => {
        if (refreshing === connection) refreshing = null;
      });
  };
}

export function createSession(deps: SessionDeps): Session {
  let state = IDLE;
  let generation = 0;
  let controller: AbortController | null = null;
  let live: Live | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = (): void => {
    clearTimeout(retryTimer);
    clearTimeout(stableTimer);
  };

  const setState = (next: Partial<SessionState>): void => {
    state = { ...state, ...next };
    deps.onState(state);
  };

  const teardown = async (reason: "user" | "switching"): Promise<void> => {
    const ending = live;
    live = null;
    if (!ending) return;
    for (const off of ending.unsubscribe) off();
    deps.onConnection(null);
    try {
      await ending.connection.disconnect(reason);
    } catch (error: unknown) {
      deps.onError(error);
    }
  };

  const finish = (reason: SessionEndReason): void => {
    generation += 1;
    controller?.abort();
    clearTimers();
    void teardown("user");
    setState({ status: "left", reason, nextRetryAt: null });
  };

  const scheduleRetry = (): void => {
    clearTimers();
    void teardown("switching");
    const attempt = state.attempt + 1;
    const delay = backoffDelay(attempt);
    setState({
      status: "retrying",
      attempt,
      nextRetryAt: deps.now() + delay,
      reason: null,
    });
    retryTimer = setTimeout(run, delay);
  };

  const failed = (error: ServiceError): void => {
    const reason = error.final ? endReasonFor(error.code) : null;
    if (reason) finish(reason);
    else scheduleRetry();
  };

  const syncMedia = (): void => {
    const current = live;
    if (!current || state.status !== "connected") return;
    current.publications
      .sync(deps.localTracks(), deps.canPublish(), deps.outbound())
      .catch((error: unknown) => {
        // A connection that went away meanwhile fails its calls: expected.
        if (live === current) deps.onError(error);
      })
      .finally(() => {
        deps.afterMediaSync();
      });
  };

  const onServiceState = (
    current: number,
    next: ServiceConnectionState,
    error?: ServiceError,
  ): void => {
    // While connecting, `connect()` rejecting reports the failure once.
    const up = state.status === "connected" || state.status === "resuming";
    if (current !== generation || !up) return;
    if (next === "resuming") setState({ status: "resuming" });
    else if (next === "connected" && state.status === "resuming") {
      setState({ status: "connected" });
      syncMedia();
    } else if (next === "lost") scheduleRetry();
    else if (next === "failed") failed(error ?? NETWORK);
  };

  const refreshToken = createTokenRefresher(deps);

  const wire = (current: number, connection: ServiceConnection): Live => ({
    connection,
    publications: createPublications(connection),
    unsubscribe: [
      connection.on("state", (next, error) => {
        onServiceState(current, next, error);
      }),
      connection.on("tokenExpiring", () => {
        if (controller)
          refreshToken(connection, controller.signal, (error) =>
            error === undefined
              ? current === generation && live?.connection === connection
              : current === generation,
          );
      }),
      connection.on("trackAdded", deps.remote.trackAdded),
      connection.on("trackRemoved", deps.remote.trackRemoved),
      connection.on("participantJoined", deps.remote.participantJoined),
      connection.on("participantLeft", deps.remote.participantLeft),
      connection.on("speaking", deps.remote.speaking),
      connection.on("quality", deps.remote.quality),
    ],
  });

  async function connect(current: number, signal: AbortSignal): Promise<void> {
    const service = deps.service();
    if (!service) {
      finish("no-service");
      return;
    }
    let token: string | null = null;
    if (service.needsToken()) {
      setState({
        status: "waiting-for-token",
        nextRetryAt: null,
        reason: null,
      });
      token = await deps.requestToken(signal);
      if (current !== generation) return;
    }
    setState({ status: "connecting", nextRetryAt: null, reason: null });
    const timer = setTimeout(() => {
      controller?.abort(new JoinTimeout());
    }, JOIN_TIMEOUT_MS);
    try {
      await join(current, service, token, signal);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Creates the connection and joins; a late creation is disconnected. */
  async function join(
    current: number,
    service: ServiceDefinition,
    token: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    const creating = service.create({ participant: deps.participant });
    creating
      .then((late) => {
        if (signal.aborted)
          late.disconnect("switching").catch((error: unknown) => {
            deps.onError(error);
          });
      })
      .catch(() => undefined);
    const connection = await untilAborted(creating, signal);
    if (current !== generation) {
      await connection.disconnect("switching").catch((error: unknown) => {
        deps.onError(error);
      });
      return;
    }
    live = wire(current, connection);
    deps.onConnection(connection);
    // A service that ignores the signal must not hang the session either.
    await untilAborted(connection.connect(deps.room(), token, signal), signal);
    if (current !== generation) return;
    setState({ status: "connected" });
    stableTimer = setTimeout(() => {
      setState({ attempt: 0 });
    }, STABLE_AFTER_MS);
    syncMedia();
  }

  /** Starts a fresh attempt; whatever was pending or live is dropped first. */
  function run(): void {
    clearTimers();
    void teardown("switching");
    generation += 1;
    const current = generation;
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    connect(current, signal).catch((error: unknown) => {
      if (current !== generation) return;
      const reason: unknown = signal.reason;
      if (reason instanceof JoinTimeout) {
        deps.onError(reason);
        failed(NETWORK);
        return;
      }
      if (isAbort(error)) return;
      deps.onError(error);
      failed(serviceErrorOf(error));
    });
  }

  deps.onOnline(() => {
    if (state.status === "retrying") run();
  });

  return {
    get state() {
      return state;
    },
    start() {
      if (state.status !== "idle" && state.status !== "left") return;
      setState({ ...IDLE, status: firstStatus(deps.service()) });
      run();
    },
    async stop(reason) {
      generation += 1;
      controller?.abort();
      clearTimers();
      // The state changes first, so a start() during the teardown counts.
      setState(reason ? { ...IDLE, status: "left", reason } : IDLE);
      await teardown("user");
    },
    restart() {
      if (state.status === "idle" || state.status === "left") return;
      run();
    },
    retryNow() {
      if (state.status === "retrying") run();
    },
    waitingForGm(waiting) {
      const asking =
        state.status === "waiting-for-token" ||
        state.status === "waiting-for-gm";
      if (asking)
        setState({ status: waiting ? "waiting-for-gm" : "waiting-for-token" });
    },
    syncMedia,
  };
}
