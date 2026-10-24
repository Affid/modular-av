import type {
  MediaPermissions,
  RemoteTrack,
  ServiceDefinition,
  SessionStatus,
} from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeTrack,
  createMockServiceHub,
  type MockServiceHub,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, endReasonFor } from "../src/session/backoff.ts";
import { JOIN_TIMEOUT_MS, STABLE_AFTER_MS } from "../src/session/session.ts";
import { createSession, type Session } from "../src/session/session.ts";

const ROOM = "world-room";

interface Harness {
  readonly session: Session;
  readonly statuses: SessionStatus[];
  readonly added: RemoteTrack[];
  readonly joined: string[];
  readonly errors: unknown[];
  readonly env: ReturnType<typeof createFakeMediaEnv>;
  tokens: number;
  ttlSeconds: number;
  canPublish: MediaPermissions;
  outbound: MediaPermissions;
  tracks: {
    microphone: MediaStreamTrack | null;
    camera: MediaStreamTrack | null;
  };
}

/** `null` stands for "no service chosen". */
function harness(
  hub: MockServiceHub,
  participant: string,
  chosen?: ServiceDefinition | null,
): Harness {
  const service = chosen === null ? undefined : (chosen ?? hub.definition());
  const env = createFakeMediaEnv();
  const h: Harness = {
    session: undefined as unknown as Session,
    statuses: [],
    added: [],
    joined: [],
    errors: [],
    env,
    tokens: 0,
    ttlSeconds: 600,
    canPublish: { audio: true, video: true },
    outbound: { audio: false, video: true },
    tracks: {
      microphone: createFakeTrack("audio"),
      camera: createFakeTrack("video"),
    },
  };
  const session = createSession({
    participant,
    service: () => service,
    room: () => ({ name: ROOM }),
    requestToken: () => {
      h.tokens += 1;
      return Promise.resolve(
        hub.signToken({
          participant,
          room: ROOM,
          canPublish: h.canPublish,
          ttlSeconds: h.ttlSeconds,
        }),
      );
    },
    localTracks: () => h.tracks,
    canPublish: () => h.canPublish,
    outbound: () => h.outbound,
    afterMediaSync: () => undefined,
    onState: (state) => {
      if (h.statuses.at(-1) !== state.status) h.statuses.push(state.status);
    },
    onConnection: () => undefined,
    remote: {
      trackAdded: (t) => h.added.push(t),
      trackRemoved: () => undefined,
      participantJoined: (p) => h.joined.push(p),
      participantLeft: () => undefined,
      speaking: () => undefined,
    },
    onOnline: (listener) => env.onOnline(listener),
    now: () => Date.now(),
    onError: (e) => h.errors.push(e),
  });
  return Object.assign(h, { session });
}

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session lifecycle", () => {
  it("gets a token, connects and publishes with mute signalling", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");

    // Act
    h.session.start();
    await settle();

    // Assert
    expect(h.statuses).toEqual([
      "waiting-for-token",
      "connecting",
      "connected",
    ]);
    expect(hub.participants(ROOM)).toEqual(["p1"]);
    expect(hub.isMuted("p1", "microphone")).toBe(true);
    expect(hub.isMuted("p1", "camera")).toBe(false);
    expect(h.session.state).toMatchObject({ attempt: 0, reason: null });
  });

  it("connects with no token when the service needs none", async () => {
    // Arrange
    const hub = createMockServiceHub({ needsToken: false });
    const h = harness(hub, "p1");

    // Act
    h.session.start();
    await settle();

    // Assert
    expect(h.statuses).toEqual(["connecting", "connected"]);
    expect(h.tokens).toBe(0);
    expect(hub.participants(ROOM)).toEqual(["p1"]);
  });

  it("starts only from idle or left", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");

    h.session.start();
    h.session.start();
    await settle();

    expect(h.tokens).toBe(1);
  });

  it("tells the service when the outbound state changes, once", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();

    // Act
    h.outbound = { audio: true, video: true };
    h.session.syncMedia();
    h.session.syncMedia();
    await settle();

    // Assert
    expect(hub.isMuted("p1", "microphone")).toBe(false);
  });

  it("publishes only what the rights allow and follows track changes", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const viewer = harness(hub, "gm");
    viewer.session.start();
    const h = harness(hub, "p1");
    h.canPublish = { audio: true, video: false };
    h.session.start();
    await settle();
    expect(viewer.added.map((t) => t.source)).toEqual(["microphone"]);

    // Act
    const headset = createFakeTrack("audio");
    h.tracks = { microphone: headset, camera: null };
    h.session.syncMedia();
    await settle();

    // Assert
    expect(viewer.added.map((t) => t.track).at(-1)).toBe(headset);
    h.tracks = { microphone: null, camera: null };
    h.session.syncMedia();
    await settle();
    expect(h.errors).toEqual([]);
  });

  it("goes back to idle or ends on stop, and can start again", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();

    // Act / Assert
    await h.session.stop("left");
    expect(h.session.state).toMatchObject({ status: "left", reason: "left" });
    expect(hub.participants(ROOM)).toEqual([]);
    h.session.start();
    await settle();
    expect(h.session.state.status).toBe("connected");
    await h.session.stop(null);
    expect(h.session.state.status).toBe("idle");
  });

  it("ends with no-service when no service is chosen", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1", null);

    h.session.start();
    await settle();

    expect(h.session.state).toMatchObject({
      status: "left",
      reason: "no-service",
    });
  });

  it("drops a token that arrives after stop", async () => {
    // Arrange
    const hub = createMockServiceHub();
    let release: (token: string) => void = () => undefined;
    const base = harness(hub, "p1");
    const slow = createSession({
      participant: "p1",
      service: () => hub.definition(),
      room: () => ({ name: ROOM }),
      requestToken: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      localTracks: () => base.tracks,
      canPublish: () => base.canPublish,
      outbound: () => base.outbound,
      afterMediaSync: () => undefined,
      onState: () => undefined,
      onConnection: () => undefined,
      remote: {
        trackAdded: () => undefined,
        trackRemoved: () => undefined,
        participantJoined: () => undefined,
        participantLeft: () => undefined,
        speaking: () => undefined,
      },
      onOnline: () => () => undefined,
      now: () => Date.now(),
      onError: (e) => base.errors.push(e),
    });

    // Act
    slow.start();
    await slow.stop(null);
    release(
      hub.signToken({
        participant: "p1",
        room: ROOM,
        canPublish: base.canPublish,
        ttlSeconds: 60,
      }),
    );
    await settle();

    // Assert
    expect(hub.participants(ROOM)).toEqual([]);
    expect(slow.state.status).toBe("idle");
  });
});

describe("reconnecting", () => {
  it("waits while the service resumes, without a new connection", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();

    hub.startOutage("p1");
    expect(h.session.state.status).toBe("resuming");
    await vi.advanceTimersByTimeAsync(60_000);
    hub.endOutage("p1");
    await settle();

    expect(h.statuses.slice(-2)).toEqual(["resuming", "connected"]);
    expect(h.tokens).toBe(1);
  });

  it("retries once after a loss, with a fresh token, and publishes again", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const viewer = harness(hub, "gm");
    viewer.session.start();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();
    const before = Date.now();

    // Act
    hub.loseConnection("p1");

    // Assert
    expect(h.session.state).toMatchObject({
      status: "retrying",
      attempt: 1,
      nextRetryAt: before + 1000,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(h.tokens).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.session.state).toMatchObject({ status: "connected", attempt: 1 });
    expect(h.tokens).toBe(2);
    await vi.advanceTimersByTimeAsync(STABLE_AFTER_MS);
    expect(h.session.state.attempt).toBe(0);
    expect(hub.participants(ROOM)).toEqual(["gm", "p1"]);
    expect(viewer.added.filter((t) => t.participant === "p1")).toHaveLength(4);
  });

  it("backs off 1, 3, 5, 10, 20, then 30 s while connecting keeps failing", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.ttlSeconds = 0;
    const waits: number[] = [];

    // Act
    h.session.start();
    await settle();
    for (let i = 0; i < 7; i += 1) {
      const { nextRetryAt } = h.session.state;
      waits.push((nextRetryAt ?? 0) - Date.now());
      await vi.advanceTimersByTimeAsync(waits.at(-1) ?? 0);
    }

    // Assert
    expect(waits).toEqual([1000, 3000, 5000, 10000, 20000, 30000, 30000]);
    expect(h.session.state.attempt).toBe(8);
  });

  it("retries at once when the browser comes back online", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();
    hub.loseConnection("p1");

    h.env.goOnline();
    await settle();

    expect(h.session.state.status).toBe("connected");
    h.env.goOnline();
    expect(h.tokens).toBe(2);
  });

  it.each(["online", "retryNow"] as const)(
    "cancels the pending retry when %s connects first",
    async (trigger) => {
      // Arrange
      const hub = createMockServiceHub();
      const h = harness(hub, "p1");
      h.ttlSeconds = 0;
      h.session.start();
      await settle();
      expect(h.session.state.status).toBe("retrying");
      h.ttlSeconds = 600;

      // Act
      if (trigger === "online") h.env.goOnline();
      else h.session.retryNow();
      await settle();
      await vi.advanceTimersByTimeAsync(30_000);

      // Assert
      expect(h.tokens).toBe(2);
      expect(hub.participants(ROOM)).toEqual(["p1"]);
      expect(h.session.state.status).toBe("connected");
    },
  );

  it("never keeps an older connection when a new attempt starts", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const viewer = harness(hub, "gm");
    viewer.session.start();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();

    // Act
    h.session.restart();
    h.session.restart();
    await settle();

    // Assert
    expect(hub.participants(ROOM)).toEqual(["gm", "p1"]);
    expect(viewer.joined.filter((p) => p === "p1").length).toBe(2);
  });

  it("keeps the backoff growing while connections drop at once", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();
    const waits: number[] = [];

    // Act
    for (let i = 0; i < 3; i += 1) {
      hub.loseConnection("p1");
      waits.push((h.session.state.nextRetryAt ?? 0) - Date.now());
      await vi.advanceTimersByTimeAsync(waits.at(-1) ?? 0);
    }

    // Assert
    expect(waits).toEqual([1000, 3000, 5000]);
  });

  it("resets the backoff once a connection has held", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();
    hub.loseConnection("p1");
    await vi.advanceTimersByTimeAsync(1000);

    await vi.advanceTimersByTimeAsync(STABLE_AFTER_MS);
    hub.loseConnection("p1");

    expect(h.session.state.attempt).toBe(1);
  });

  it("ends up idle or started in the order asked, around a stop", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();

    const stopping = h.session.stop(null);
    h.session.start();
    await stopping;
    await settle();

    expect(h.session.state.status).toBe("connected");
  });

  it("reports a stale connection that fails to disconnect", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const definition = hub.definition();
    let release: () => void = () => undefined;
    const h = harness(hub, "p1", {
      ...definition,
      create: async (context) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        const connection = await definition.create(context);
        return {
          ...connection,
          disconnect: () => Promise.reject(new Error("already gone")),
        };
      },
    });
    h.session.start();
    await settle();

    // Act
    await h.session.stop(null);
    release();
    await settle();

    // Assert
    expect(h.errors).toEqual([new Error("already gone")]);
  });

  it("retries now on request, only while retrying", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.retryNow();
    h.session.start();
    await settle();
    h.session.retryNow();
    hub.loseConnection("p1");

    h.session.retryNow();
    await settle();

    expect(h.tokens).toBe(2);
    expect(h.session.state.status).toBe("connected");
  });

  it("restarts with a fresh token when asked, and not when stopped", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.restart();
    h.session.start();
    await settle();

    h.session.restart();
    await settle();

    expect(h.tokens).toBe(2);
    expect(h.session.state.status).toBe("connected");
    expect(hub.participants(ROOM)).toEqual(["p1"]);
  });

  it("ignores events of a connection it replaced", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();
    const other = harness(hub, "p2");

    // Act
    h.session.restart();
    other.session.start();
    await settle();

    // Assert
    expect(h.joined).toEqual(["p2"]);
  });
});

describe("a join that hangs", () => {
  it.each(["create", "connect"] as const)(
    "gives up after the join timeout when %s never settles, and retries",
    async (stage) => {
      // Arrange
      const hub = createMockServiceHub();
      const definition = hub.definition();
      let hang = true;
      const h = harness(hub, "p1", {
        ...definition,
        create: async (context) => {
          if (hang && stage === "create") return new Promise(() => undefined);
          const connection = await definition.create(context);
          if (!hang || stage !== "connect") return connection;
          return { ...connection, connect: () => new Promise(() => undefined) };
        },
      });

      // Act
      h.session.start();
      await settle();
      await vi.advanceTimersByTimeAsync(JOIN_TIMEOUT_MS);
      hang = false;

      // Assert
      expect(h.session.state).toMatchObject({ status: "retrying", attempt: 1 });
      expect(h.errors.map(String)).toContain(
        `JoinTimeout: Joining took longer than ${String(JOIN_TIMEOUT_MS / 1000)} s`,
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.session.state.status).toBe("connected");
    },
  );
});

describe("final reasons", () => {
  it.each([
    ["kick", "kicked"],
    ["closeRoom", "room-closed"],
  ] as const)("stops for good after %s", async (action, reason) => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1");
    h.session.start();
    await settle();

    if (action === "kick") hub.kick("p1");
    else hub.closeRoom(ROOM);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(h.session.state).toMatchObject({ status: "left", reason });
    expect(h.tokens).toBe(1);
  });

  it("lets the newest tab win a duplicate identity", async () => {
    const hub = createMockServiceHub();
    const older = harness(hub, "p1");
    older.session.start();
    await settle();

    const newer = harness(hub, "p1");
    newer.session.start();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(older.session.state).toMatchObject({
      status: "left",
      reason: "joined-elsewhere",
    });
    expect(newer.session.state.status).toBe("connected");
  });

  it("ends on a token the service rejects, and reports it", async () => {
    const hub = createMockServiceHub();
    const definition = hub.definition();
    const h = harness(hub, "p1", {
      ...definition,
      create: (context) =>
        definition.create({ participant: `${context.participant}-x` }),
    });

    h.session.start();
    await settle();

    expect(h.session.state).toMatchObject({ status: "left", reason: "auth" });
    expect(h.errors).toHaveLength(1);
  });

  it("treats an unknown failure as a network problem and retries", async () => {
    const hub = createMockServiceHub();
    const h = harness(hub, "p1", {
      ...hub.definition(),
      create: () => Promise.reject(new Error("SDK failed to load")),
    });

    h.session.start();
    await settle();

    expect(h.session.state.status).toBe("retrying");
    expect(h.errors).toEqual([new Error("SDK failed to load")]);
  });

  it("reports a disconnect that fails during teardown", async () => {
    const hub = createMockServiceHub();
    const definition = hub.definition();
    const h = harness(hub, "p1", {
      ...definition,
      create: async (context) => {
        const connection = await definition.create(context);
        return {
          ...connection,
          disconnect: () => Promise.reject(new Error("socket closed")),
        };
      },
    });
    h.session.start();
    await settle();

    await h.session.stop("left");

    expect(h.errors).toEqual([new Error("socket closed")]);
  });
});

describe("backoff helpers", () => {
  it("clamps attempts to the schedule", () => {
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(99)).toBe(30000);
  });

  it("maps service errors to end reasons", () => {
    expect(endReasonFor("full")).toBe("full");
    expect(endReasonFor("unsupported")).toBe("unsupported");
    expect(endReasonFor("network")).toBeNull();
    expect(endReasonFor("token-expired")).toBeNull();
  });
});
