import type {
  ParticipantId,
  RemoteTrack,
  ServiceConnection,
  ServiceConnectionState,
  ServiceError,
} from "@modular-av/api";
import { createFakeTrack, fakeTrackInfo } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJitsiConnection } from "../src/connection.ts";
import {
  createFakeSdk,
  EVENTS,
  type FakeConference,
  type FakeConnection,
  type FakeSdk,
  remoteTrack,
} from "./fake-sdk.ts";
import { installMediaStream } from "./media-stream.ts";

const SERVER = {
  serviceUrl: "wss://meet.example.com/xmpp-websocket",
  domain: "meet.example.com",
  muc: "conference.meet.example.com",
};
const NOW = 1_800_000_000_000;

const encode = (value: unknown): string =>
  btoa(JSON.stringify(value)).replace(/=+$/, "");

/** A JWT-shaped token expiring `exp` seconds after NOW (signature unread). */
const token = (expInSeconds = 600): string =>
  `${encode({ alg: "HS256" })}.${encode({ exp: NOW / 1000 + expInSeconds })}.sig`;

interface Recorded {
  readonly states: [ServiceConnectionState, ServiceError | undefined][];
  readonly joined: ParticipantId[];
  readonly left: ParticipantId[];
  readonly added: RemoteTrack[];
  readonly quality: [ParticipantId, string][];
  tokenWarnings: number;
}

interface Setup {
  readonly sdk: FakeSdk;
  readonly service: ServiceConnection;
  readonly seen: Recorded;
  readonly errors: unknown[];
  connection(): FakeConnection;
  conference(): FakeConference;
}

function setup(self = "alice"): Setup {
  const sdk = createFakeSdk();
  const errors: unknown[] = [];
  const service = createJitsiConnection(
    { participant: self },
    { sdk, server: SERVER, now: () => NOW, onError: (e) => errors.push(e) },
  );
  const seen: Recorded = {
    states: [],
    joined: [],
    left: [],
    added: [],
    quality: [],
    tokenWarnings: 0,
  };
  service.on("state", (state, error) => seen.states.push([state, error]));
  service.on("participantJoined", (p) => seen.joined.push(p));
  service.on("participantLeft", (p) => seen.left.push(p));
  service.on("trackAdded", (t) => seen.added.push(t));
  service.on("quality", (p, q) => seen.quality.push([p, q]));
  service.on("tokenExpiring", () => {
    seen.tokenWarnings += 1;
  });
  const connection = (): FakeConnection => {
    const made = sdk.connections.at(-1);
    if (!made) throw new Error("no connection made");
    return made;
  };
  const conference = (): FakeConference => {
    const made = connection().conference;
    if (!made) throw new Error("no conference made");
    return made;
  };
  return { sdk, service, seen, errors, connection, conference };
}

const join = (s: Setup, room = "World-1", t = token()): Promise<void> =>
  s.service.connect({ name: room }, t, new AbortController().signal);

/** Lets every pending promise run (leaving takes several awaits). */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const lastState = (s: Setup): [ServiceConnectionState, string | undefined] => {
  const [state, error] = s.seen.states.at(-1) ?? ["idle", undefined];
  return [state, error?.code];
};

beforeEach(() => {
  installMediaStream();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("joining a Jitsi room", () => {
  it("connects with the token, then joins the room in lower case", async () => {
    // Arrange
    const s = setup();
    const t = token();

    // Act
    await join(s, "World-1", t);

    // Assert
    expect(s.connection().token).toBe(t);
    expect(s.connection().options).toEqual({
      hosts: { domain: SERVER.domain, muc: SERVER.muc },
      serviceUrl: SERVER.serviceUrl,
    });
    expect(s.conference().name).toBe("world-1");
    expect(s.conference().options).toMatchObject({ p2p: { enabled: false } });
    expect(lastState(s)).toEqual(["connected", undefined]);
  });

  it("refuses to connect without a token, for good", async () => {
    const s = setup();

    await expect(
      s.service.connect({ name: "r" }, null, new AbortController().signal),
    ).rejects.toMatchObject({ serviceError: { code: "auth", final: true } });
  });

  it("tells a forged token from an expired one", async () => {
    // Arrange
    const forged = setup();
    const expired = setup();
    for (const s of [forged, expired])
      s.sdk.setup = (c) => {
        c.outcome = "connection.passwordRequired";
      };

    // Act
    const results = await Promise.allSettled([
      join(forged),
      join(expired, "r", token(-60)),
    ]);

    // Assert
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    const reasons = results.map((r) =>
      r.status === "rejected"
        ? (r.reason as { serviceError: ServiceError }).serviceError
        : null,
    );
    expect(reasons).toEqual([
      expect.objectContaining({ code: "auth", final: true }),
      expect.objectContaining({ code: "token-expired", final: false }),
    ]);
  });

  it("names a full room and a refused room, and closes what it opened", async () => {
    const s = setup();
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.joinOutcome = "conference.max_users";
        return conference;
      };
    };

    let disconnects = 0;
    const disconnect = s.sdk.setup;
    s.sdk.setup = (c) => {
      disconnect(c);
      const real = c.disconnect.bind(c);
      c.disconnect = () => {
        disconnects += 1;
        return real();
      };
    };

    await expect(join(s)).rejects.toMatchObject({
      serviceError: { code: "full", final: true },
    });
    expect(s.connection().disconnected).toBe(true);
    expect(disconnects).toBe(1);
  });

  it("warns when the server makes players moderators", async () => {
    // Arrange: an unchanged Jitsi install makes everyone with a token one.
    const s = setup();
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.moderator = true;
        return conference;
      };
    };

    // Act
    await join(s);

    // Assert
    expect(lastState(s)).toEqual(["connected", undefined]);
    expect(s.errors).toHaveLength(1);
    expect(String(s.errors[0])).toMatch(/moderator/);
  });

  it("fails the attempt, for a retry, when the connection drops while joining", async () => {
    // Arrange: the room never answers, and the connection drops.
    const s = setup();
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.join = () => {
          queueMicrotask(() => {
            c.emit(EVENTS.CONNECTION.CONNECTION_DISCONNECTED);
          });
        };
        return conference;
      };
    };

    // Act / Assert
    await expect(join(s)).rejects.toMatchObject({
      serviceError: { code: "network", final: false },
    });
    expect(s.connection().disconnected).toBe(true);
  });

  it("never reports connected after leaving during the join", async () => {
    // Arrange
    const s = setup();
    let release = (): void => undefined;
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.join = () => {
          release = () => {
            conference.emit(EVENTS.CONFERENCE.CONFERENCE_JOINED);
          };
        };
        return conference;
      };
    };

    // Act
    const joining = join(s);
    await flush();
    await s.service.disconnect("user");
    release();

    // Assert
    await expect(joining).rejects.toMatchObject({ name: "AbortError" });
    expect(s.seen.states.map(([state]) => state)).toEqual(["disconnected"]);
  });

  it("stops at once when the attempt is aborted", async () => {
    const s = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(
      s.service.connect({ name: "r" }, token(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("who is in the call", () => {
  it("reports those already there once joined, by their Foundry id", async () => {
    // Arrange
    const s = setup();
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.on(EVENTS.CONFERENCE.CONFERENCE_JOINED, () => undefined);
        queueMicrotask(() => {
          conference.userJoins("ep-bob", "bob");
        });
        return conference;
      };
    };

    // Act
    await join(s);

    // Assert
    expect(s.seen.joined).toEqual(["bob"]);
    expect(s.seen.states.map(([state]) => state)).toEqual(["connected"]);
  });

  it("follows joins and leaves after joining", async () => {
    const s = setup();
    await join(s);

    s.conference().userJoins("ep-bob", "bob");
    s.conference().userLeaves("ep-bob");

    expect(s.seen.joined).toEqual(["bob"]);
    expect(s.seen.left).toEqual(["bob"]);
  });

  it("lets a player's newer tab replace the older one (a reload leaves the old in the room)", async () => {
    // Arrange
    const s = setup();
    await join(s);
    const oldMic = createFakeTrack("audio");
    s.conference().userJoins("ep-bob-old", "bob");

    // Act: the new tab comes; the old one's track and leave come later.
    s.conference().userJoins("ep-bob-new", "bob");
    s.conference().emit(
      EVENTS.CONFERENCE.TRACK_ADDED,
      remoteTrack({ endpoint: "ep-bob-old", kind: "audio", track: oldMic }),
    );
    s.conference().userLeaves("ep-bob-old");
    const whileNew = [...s.seen.left];
    s.conference().userLeaves("ep-bob-new");

    // Assert: left and joined again, so every UI redraws the player.
    expect(s.seen.joined).toEqual(["bob", "bob"]);
    expect(whileNew).toEqual(["bob"]);
    expect(s.seen.left).toEqual(["bob", "bob"]);
    expect(s.seen.added).toEqual([]);
  });

  it("ignores anyone the server doesn't vouch for, and says why once", async () => {
    const s = setup();
    await join(s);

    s.conference().userJoins("ep-x", null);
    s.conference().emit(
      EVENTS.CONFERENCE.TRACK_ADDED,
      remoteTrack({
        endpoint: "ep-x",
        kind: "audio",
        track: createFakeTrack("audio"),
      }),
    );

    expect(s.seen.joined).toEqual([]);
    expect(s.seen.added).toEqual([]);
    expect(s.errors).toHaveLength(1);
    expect(String(s.errors[0])).toMatch(/presence_identity/);
  });

  it("lets the newer tab win: one already there is left alone", async () => {
    const s = setup("alice");
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.participants = [
          {
            getId: () => "ep-old",
            getIdentity: () => ({ user: { id: "alice" } }),
          },
        ];
        return conference;
      };
    };

    await join(s);

    expect(lastState(s)).toEqual(["connected", undefined]);
    expect(s.seen.joined).toEqual([]);
  });

  it("keeps ignoring an older tab still in the room, when its tracks arrive", async () => {
    // Arrange: a closed tab lingers while the server keeps its session.
    const s = setup("alice");
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.participants = [
          {
            getId: () => "ep-old",
            getIdentity: () => ({ user: { id: "alice" } }),
          },
        ];
        return conference;
      };
    };
    await join(s);

    // Act
    s.conference().emit(
      EVENTS.CONFERENCE.TRACK_ADDED,
      remoteTrack({
        endpoint: "ep-old",
        kind: "audio",
        track: createFakeTrack("audio"),
      }),
    );
    await flush();

    // Assert
    expect(lastState(s)).toEqual(["connected", undefined]);
    expect(s.seen.added).toEqual([]);
  });

  it("ends for good when the same player joins again elsewhere", async () => {
    const s = setup("alice");
    await join(s);

    s.conference().userJoins("ep-new", "alice");
    await flush();

    expect(lastState(s)).toEqual(["failed", "duplicate"]);
    expect(s.conference().left).toBe(true);
  });
});

describe("remote media", () => {
  it("reports cameras and microphones as the participant's, not screens", async () => {
    // Arrange
    const s = setup();
    await join(s);
    s.conference().userJoins("ep-bob", "bob");
    const mic = createFakeTrack("audio");
    const camera = createFakeTrack("video");

    // Act
    for (const t of [
      remoteTrack({ endpoint: "ep-bob", kind: "audio", track: mic }),
      remoteTrack({ endpoint: "ep-bob", kind: "video", track: camera }),
      remoteTrack({
        endpoint: "ep-bob",
        kind: "video",
        videoType: "desktop",
        track: createFakeTrack("video"),
      }),
    ])
      s.conference().emit(EVENTS.CONFERENCE.TRACK_ADDED, t);

    // Assert
    expect(s.seen.added).toEqual([
      { participant: "bob", source: "microphone", track: mic },
      { participant: "bob", source: "camera", track: camera },
    ]);
  });

  it("asks the bridge for less, or nothing, of what the core doesn't show", async () => {
    // Arrange
    const s = setup();
    await join(s);
    s.conference().userJoins("ep-bob", "bob");
    for (const kind of ["audio", "video"] as const)
      s.conference().emit(
        EVENTS.CONFERENCE.TRACK_ADDED,
        remoteTrack({ endpoint: "ep-bob", kind, track: createFakeTrack(kind) }),
      );

    // Act
    s.service.setSubscription("bob", "camera", {
      enabled: true,
      maxQuality: "low",
    });
    const small = s.conference().constraints;
    s.service.setSubscription("bob", "camera", { enabled: false });
    s.service.setSubscription("bob", "microphone", { enabled: false });

    // Assert
    expect(small?.constraints).toEqual({ "ep-bob-v0": { maxHeight: 180 } });
    expect(s.conference().constraints?.constraints).toEqual({
      "ep-bob-v0": { maxHeight: 0 },
    });
    expect(s.conference().audio).toEqual({
      all: true,
      include: [],
      exclude: ["ep-bob-a0"],
    });
  });

  it("forgets the sources of tracks that went, and of players who left", async () => {
    // Arrange
    const s = setup();
    await join(s);
    for (const [endpoint, id] of [
      ["ep-bob", "bob"],
      ["ep-carol", "carol"],
    ] as const) {
      s.conference().userJoins(endpoint, id);
      s.conference().emit(
        EVENTS.CONFERENCE.TRACK_ADDED,
        remoteTrack({
          endpoint,
          kind: "audio",
          track: createFakeTrack("audio"),
        }),
      );
    }
    const bobAudio = remoteTrack({
      endpoint: "ep-bob",
      kind: "video",
      track: createFakeTrack("video"),
    });
    s.conference().emit(EVENTS.CONFERENCE.TRACK_ADDED, bobAudio);

    // Act
    s.conference().emit(EVENTS.CONFERENCE.TRACK_REMOVED, bobAudio);
    s.conference().userLeaves("ep-carol");
    s.service.setSubscription("bob", "microphone", { enabled: false });

    // Assert: only what is still there is asked for.
    expect(s.conference().constraints?.constraints).toEqual({});
    expect(s.conference().audio?.exclude).toEqual(["ep-bob-a0"]);
  });

  it("reports how each participant's connection is, in the core's words", async () => {
    const s = setup();
    await join(s);
    s.conference().userJoins("ep-bob", "bob");

    for (const percent of [90, 50, 10, 0])
      s.conference().emit(EVENTS.QUALITY.REMOTE_STATS_UPDATED, "ep-bob", {
        connectionQuality: percent,
      });

    expect(s.seen.quality).toEqual([
      ["bob", "excellent"],
      ["bob", "good"],
      ["bob", "poor"],
      ["bob", "lost"],
    ]);
  });
});

describe("the core's own tracks", () => {
  it("sends them in a stream of their own, a camera with its size", async () => {
    // Arrange
    const s = setup();
    await join(s);
    const camera = createFakeTrack("video");

    // Act
    const published = await s.service.publish(camera, "camera");

    // Assert
    expect(published.source).toBe("camera");
    const [jitsi] = s.sdk.localTracks;
    expect(jitsi?.info.stream.getTracks()).toEqual([camera]);
    expect(jitsi?.info.constraints).toEqual({
      width: { ideal: 640 },
      height: { ideal: 480 },
    });
    expect(s.conference().added).toEqual([jitsi]);
  });

  it("never stops them: not on unpublish, a replacement or leaving", async () => {
    // Arrange
    const s = setup();
    await join(s);
    const mic = createFakeTrack("audio");
    const camera = createFakeTrack("video");
    const camera2 = createFakeTrack("video");
    await s.service.publish(mic, "microphone");
    const cam = await s.service.publish(camera, "camera");

    // Act
    await s.service.replaceTrack(cam, camera2);
    await s.service.unpublish(cam);
    await s.service.disconnect("user");

    // Assert
    for (const t of [mic, camera, camera2])
      expect(fakeTrackInfo(t).readyState).toBe("live");
    expect(s.sdk.localTracks.map((t) => t.calls.at(-1))).toEqual([
      "dispose",
      "dispose",
      "dispose",
    ]);
    expect(lastState(s)).toEqual(["disconnected", undefined]);
  });

  it("mutes the microphone through Jitsi, never the camera", async () => {
    const s = setup();
    await join(s);
    const mic = await s.service.publish(createFakeTrack("audio"), "microphone");
    const camera = createFakeTrack("video");
    const cam = await s.service.publish(camera, "camera");

    await s.service.setMuted(mic, true);
    await s.service.setMuted(cam, true);

    expect(s.sdk.localTracks.map((t) => t.calls)).toEqual([["mute"], []]);
    expect(fakeTrackInfo(camera).readyState).toBe("live");
  });

  it("lets go of a track whose publishing overlapped leaving, or failed", async () => {
    // Arrange
    const s = setup();
    await join(s);
    let finish = (): void => undefined;
    s.conference().addTrack = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const camera = createFakeTrack("video");

    // Act
    const publishing = s.service.publish(camera, "camera");
    await flush();
    await s.service.disconnect("user");
    finish();

    // Assert
    await expect(publishing).rejects.toThrow(/left/);
    expect(s.sdk.localTracks[0]?.calls).toEqual(["dispose"]);
    expect(fakeTrackInfo(camera).readyState).toBe("live");
  });

  it("refuses a screen share or a track of the wrong kind", async () => {
    const s = setup();
    await join(s);

    await expect(
      s.service.publish(createFakeTrack("video"), "screen"),
    ).rejects.toThrow(/screen/);
    await expect(
      s.service.publish(createFakeTrack("audio"), "camera"),
    ).rejects.toThrow(/camera/);
  });
});

describe("staying connected", () => {
  it("resumes while its link to the bridge is interrupted", async () => {
    const s = setup();
    await join(s);

    s.conference().emit(EVENTS.CONFERENCE.CONNECTION_INTERRUPTED);
    s.conference().emit(EVENTS.CONFERENCE.CONNECTION_RESTORED);

    expect(s.seen.states.map(([state]) => state)).toEqual([
      "connected",
      "resuming",
      "connected",
    ]);
  });

  it("is lost once Jitsi gives up, and reports it once", async () => {
    const s = setup();
    await join(s);

    s.conference().emit(
      EVENTS.CONFERENCE.CONFERENCE_FAILED,
      "conference.iceFailed",
    );
    s.connection().emit(EVENTS.CONNECTION.CONNECTION_DISCONNECTED);
    await flush();

    expect(s.seen.states.map(([state]) => state)).toEqual([
      "connected",
      "lost",
    ]);
    expect(s.connection().disconnected).toBe(true);
  });

  it("ends for good when removed from the room", async () => {
    const s = setup();
    await join(s);

    s.conference().emit(EVENTS.CONFERENCE.KICKED);

    expect(lastState(s)).toEqual(["failed", "kicked"]);
  });

  it("leaving on purpose reports no failure", async () => {
    const s = setup();
    await join(s);

    await s.service.disconnect("user");
    s.connection().emit(EVENTS.CONNECTION.CONNECTION_DISCONNECTED);

    expect(s.seen.states.map(([state]) => state)).toEqual([
      "connected",
      "disconnected",
    ]);
  });
});

describe("a token that runs out while connected", () => {
  it("asks the core for a fresh one and resumes with it", async () => {
    // Arrange
    const s = setup();
    await join(s);

    // Act
    s.connection().emit(EVENTS.CONNECTION.CONNECTION_TOKEN_EXPIRED);
    await s.service.updateToken?.("fresh");

    // Assert
    expect(s.seen.tokenWarnings).toBe(1);
    expect(s.connection().refreshed).toEqual(["fresh"]);
    expect(s.seen.states.map(([state]) => state)).toEqual([
      "connected",
      "resuming",
      "connected",
    ]);
  });

  it("is lost when no fresh token comes in time (no GM online)", async () => {
    vi.useFakeTimers();
    const s = setup();
    await join(s);

    s.connection().emit(EVENTS.CONNECTION.CONNECTION_TOKEN_EXPIRED);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(lastState(s)).toEqual(["lost", "token-expired"]);
  });

  it("is lost when Jitsi doesn't resume with the fresh token", async () => {
    const s = setup();
    await join(s);
    s.connection().refreshToken = () => Promise.reject(new Error("timed out"));

    s.connection().emit(EVENTS.CONNECTION.CONNECTION_TOKEN_EXPIRED);
    await s.service.updateToken?.("fresh");

    expect(lastState(s)).toEqual(["lost", "network"]);
    expect(s.errors).toEqual([
      expect.objectContaining({ message: "timed out" }),
    ]);
  });
});

describe("connection details", () => {
  it("tells its own and each participant's latest measurements", async () => {
    // Arrange
    const s = setup();
    await join(s);
    s.conference().userJoins("ep-bob", "bob");

    // Act
    s.conference().emit(EVENTS.QUALITY.LOCAL_STATS_UPDATED, {
      jvbRTT: 42,
      packetLoss: { total: 3, download: 2, upload: 4 },
      transport: [{ local_candidate_type: "relay" }],
    });
    s.conference().emit(EVENTS.QUALITY.REMOTE_STATS_UPDATED, "ep-bob", {
      connectionQuality: 80,
      jvbRTT: 20,
      packetLoss: { total: 1, download: 1, upload: 5 },
    });

    // Assert
    expect(await s.service.getStats()).toEqual({
      roundTripMs: 42,
      packetLoss: 0.03,
      relayed: true,
    });
    expect(await s.service.getParticipantStats?.("bob")).toEqual({
      roundTripMs: 20,
      packetLoss: 0.05,
    });
  });

  it("has nothing yet to tell of someone not measured", async () => {
    const s = setup();
    await join(s);

    expect(await s.service.getStats()).toEqual({});
    await expect(s.service.getParticipantStats?.("bob")).rejects.toThrow(/bob/);
  });
});
