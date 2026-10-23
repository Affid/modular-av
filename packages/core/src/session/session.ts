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

interface Live {
  readonly connection: ServiceConnection;
  readonly publications: Publications;
  readonly unsubscribe: readonly (() => void)[];
}

export function createSession(deps: SessionDeps): Session {
  let state = IDLE;
  let generation = 0;
  let controller: AbortController | null = null;
  let live: Live | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

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
    clearTimeout(retryTimer);
    void teardown("user");
    setState({ status: "left", reason, nextRetryAt: null });
  };

  const scheduleRetry = (): void => {
    void teardown("switching");
    const attempt = state.attempt + 1;
    const delay = backoffDelay(attempt);
    setState({
      status: "retrying",
      attempt,
      nextRetryAt: deps.now() + delay,
      reason: null,
    });
    clearTimeout(retryTimer);
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

  const wire = (current: number, connection: ServiceConnection): Live => ({
    connection,
    publications: createPublications(connection),
    unsubscribe: [
      connection.on("state", (next, error) => {
        onServiceState(current, next, error);
      }),
      connection.on("trackAdded", deps.remote.trackAdded),
      connection.on("trackRemoved", deps.remote.trackRemoved),
      connection.on("participantJoined", deps.remote.participantJoined),
      connection.on("participantLeft", deps.remote.participantLeft),
      connection.on("speaking", deps.remote.speaking),
    ],
  });

  async function connect(current: number, signal: AbortSignal): Promise<void> {
    const service = deps.service();
    if (!service) {
      finish("no-service");
      return;
    }
    setState({ status: "waiting-for-token", nextRetryAt: null, reason: null });
    const token = await deps.requestToken(signal);
    if (current !== generation) return;
    setState({ status: "connecting" });
    const connection = await service.create({ participant: deps.participant });
    if (current !== generation) {
      await connection.disconnect("switching");
      return;
    }
    live = wire(current, connection);
    deps.onConnection(connection);
    await connection.connect(deps.room(), token, signal);
    if (current !== generation) return;
    setState({ status: "connected", attempt: 0 });
    syncMedia();
  }

  function run(): void {
    generation += 1;
    const current = generation;
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    connect(current, signal).catch((error: unknown) => {
      if (current !== generation || isAbort(error)) return;
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
      setState({ ...IDLE, status: "waiting-for-token" });
      run();
    },
    async stop(reason) {
      generation += 1;
      controller?.abort();
      clearTimeout(retryTimer);
      await teardown("user");
      setState(reason ? { ...IDLE, status: "left", reason } : IDLE);
    },
    restart() {
      if (state.status === "idle" || state.status === "left") return;
      clearTimeout(retryTimer);
      void teardown("switching");
      run();
    },
    retryNow() {
      if (state.status === "retrying") run();
    },
    syncMedia,
  };
}
