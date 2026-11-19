import type {
  ParticipantId,
  RemoteTrack,
  ServiceConnection,
  ServiceConnectionState,
  ServiceError,
} from "@modular-av/api";
import { createFakeTrack } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESENCE_KEY } from "../src/binding.ts";
import { createJitsiConnection } from "../src/connection.ts";
import { createHub, type FakeHub } from "./fake-channel.ts";
import {
  createFakeSdk,
  type FakeConference,
  type FakeConnection,
  type FakeSdk,
  remoteTrack,
} from "./fake-sdk.ts";
import { installMediaStream } from "./media-stream.ts";

const ROOM = "ourtable";
const OPEN_SERVER = {
  serviceUrl: `wss://meet.example.com/xmpp-websocket?room=${ROOM}`,
  domain: "meet.example.com",
  muc: "conference.meet.example.com",
  open: { room: ROOM },
};
const NOW = 1_800_000_000_000;
const GRACE = 15_000;

interface Setup {
  readonly sdk: FakeSdk;
  readonly hub: FakeHub;
  readonly service: ServiceConnection;
  readonly errors: unknown[];
  readonly states: [ServiceConnectionState, ServiceError | undefined][];
  readonly joined: ParticipantId[];
  readonly left: ParticipantId[];
  readonly added: RemoteTrack[];
  outsiders: number;
  connection(): FakeConnection;
  conference(): FakeConference;
}

function setup(self = "alice", joinedAt = 100, hub = createHub()): Setup {
  const sdk = createFakeSdk();
  const s: Setup = {
    sdk,
    hub,
    service: createJitsiConnection(
      { participant: self },
      {
        sdk,
        server: OPEN_SERVER,
        now: () => NOW,
        onError: (e) => s.errors.push(e),
        measureFrame: () => Promise.resolve(null),
        openRoom: {
          channel: hub.channel(self),
          joinedAt,
          outsiderGraceMs: GRACE,
          onOutsider: () => {
            s.outsiders += 1;
          },
        },
      },
    ),
    errors: [],
    states: [],
    joined: [],
    left: [],
    added: [],
    outsiders: 0,
    connection() {
      const made = sdk.connections.at(-1);
      if (!made) throw new Error("no connection made");
      return made;
    },
    conference() {
      const made = s.connection().conference;
      if (!made) throw new Error("no conference made");
      return made;
    },
  };
  s.service.on("state", (state, error) => s.states.push([state, error]));
  s.service.on("participantJoined", (p) => s.joined.push(p));
  s.service.on("participantLeft", (p) => s.left.push(p));
  s.service.on("trackAdded", (t) => s.added.push(t));
  return s;
}

const join = (s: Setup): Promise<void> =>
  s.service.connect({ name: "World-1" }, null, new AbortController().signal);

/** Lets every queued message and promise run. */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const hello = (endpoint: string, joinedAt = 50) => ({
  v: 1,
  type: "hello",
  room: ROOM,
  endpoint,
  joinedAt,
});

const named = (user: string) => ({ [PRESENCE_KEY]: user });

const lastState = (s: Setup): [ServiceConnectionState, string | undefined] => {
  const [state, error] = s.states.at(-1) ?? ["idle", undefined];
  return [state, error?.code];
};

beforeEach(() => {
  installMediaStream();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("joining an open Jitsi server", () => {
  it("joins the link's room without a token, named in its first presence, and says hello", async () => {
    // Arrange
    const s = setup("alice");

    // Act
    await join(s);

    // Assert
    expect(s.connection().token).toBeNull();
    expect(s.connection().options.serviceUrl).toBe(OPEN_SERVER.serviceUrl);
    expect(s.conference().name).toBe(ROOM);
    expect(s.conference().localProperties).toEqual(named("alice"));
    expect(s.conference().propertiesBeforeJoin).toEqual([PRESENCE_KEY]);
    expect(s.hub.sent).toEqual([
      {
        from: "alice",
        data: {
          v: 1,
          type: "hello",
          room: ROOM,
          endpoint: "self",
          joinedAt: 100,
        },
      },
    ]);
    expect(lastState(s)).toEqual(["connected", undefined]);
  });

  it("never warns of moderators or of identities the server doesn't give", async () => {
    const s = setup();
    s.sdk.setup = (c) => {
      const init = c.initJitsiConference.bind(c);
      c.initJitsiConference = (name, options) => {
        const conference = init(name, options);
        conference.moderator = true;
        return conference;
      };
    };

    await join(s);
    s.conference().userJoins("ep-bob", null, named("bob"));
    s.hub.channel("bob").send(hello("ep-bob"));
    await flush();

    expect(s.errors).toEqual([]);
  });
});

describe("who is who on an open server", () => {
  it("shows a player once their Foundry claim matches their presence, with tracks that came first", async () => {
    // Arrange
    const s = setup();
    await join(s);
    const mic = createFakeTrack("audio");
    s.conference().userJoins("ep-bob", null, named("bob"));
    s.conference().trackArrives(
      remoteTrack({ endpoint: "ep-bob", kind: "audio", track: mic }),
    );
    const before = [...s.joined];

    // Act
    s.hub.channel("bob").send(hello("ep-bob"));
    await flush();

    // Assert
    expect(before).toEqual([]);
    expect(s.joined).toEqual(["bob"]);
    expect(s.added).toEqual([
      { participant: "bob", source: "microphone", track: mic },
    ]);
    expect(s.hub.sent.at(-1)).toEqual({
      from: "alice",
      data: {
        v: 1,
        type: "welcome",
        room: ROOM,
        endpoint: "self",
        joinedAt: 100,
      },
      recipients: ["bob"],
    });
  });

  it("shows a player whose claim came before their presence", async () => {
    const s = setup();
    await join(s);

    s.hub.channel("bob").send(hello("ep-bob"));
    await flush();
    s.conference().userJoins("ep-bob", null, named("bob"));

    expect(s.joined).toEqual(["bob"]);
  });

  it("gives no place to someone naming a player they aren't", async () => {
    // Arrange
    const s = setup();
    await join(s);
    const mallory = s.hub.channel("mallory");

    // Act: Mallory's client names Bob in its presence.
    s.conference().userJoins("ep-imp", null, named("bob"));
    mallory.send(hello("ep-imp"));
    s.conference().trackArrives(
      remoteTrack({
        endpoint: "ep-imp",
        kind: "audio",
        track: createFakeTrack("audio"),
      }),
    );
    await flush();
    const whileOnlyMallory = [...s.joined];
    s.conference().userJoins("ep-bob", null, named("bob"));
    s.hub.channel("bob").send(hello("ep-bob"));
    await flush();

    // Assert
    expect(whileOnlyMallory).toEqual([]);
    expect(s.joined).toEqual(["bob"]);
    expect(s.added).toEqual([]);
  });

  it("keeps a player's newest tab, whatever order their claims arrive in", async () => {
    const s = setup();
    await join(s);
    s.conference().userJoins("ep-old", null, named("bob"));
    s.conference().userJoins("ep-new", null, named("bob"));

    s.hub.channel("bob").send(hello("ep-new", 20));
    s.hub.channel("bob").send(hello("ep-old", 10));
    await flush();
    s.conference().userLeaves("ep-old");
    const afterOldLeft = [...s.left];
    s.conference().userLeaves("ep-new");

    expect(s.joined).toEqual(["bob"]);
    expect(afterOldLeft).toEqual([]);
    expect(s.left).toEqual(["bob"]);
  });

  it("moves to a player's newer tab when its claim comes second", async () => {
    const s = setup();
    await join(s);
    s.conference().userJoins("ep-old", null, named("bob"));
    s.conference().userJoins("ep-new", null, named("bob"));

    s.hub.channel("bob").send(hello("ep-old", 10));
    await flush();
    s.hub.channel("bob").send(hello("ep-new", 20));
    await flush();

    expect(s.joined).toEqual(["bob", "bob"]);
    expect(s.left).toEqual(["bob"]);
  });

  it("stays beside its own older tab, and gives way to a newer one for good", async () => {
    const hub = createHub();
    const s = setup("alice", 100, hub);
    await join(s);
    s.conference().userJoins("ep-older", null, named("alice"));
    s.conference().userJoins("ep-newer", null, named("alice"));

    hub.channel("alice").send(hello("ep-older", 50));
    await flush();
    const afterOlder = lastState(s);
    hub.channel("alice").send(hello("ep-newer", 200));
    await flush();

    expect(afterOlder).toEqual(["connected", undefined]);
    expect(lastState(s)).toEqual(["failed", "duplicate"]);
    expect(s.joined).toEqual([]);
  });

  it("listens no more once it left", async () => {
    const s = setup();
    await join(s);

    await s.service.disconnect("user");
    s.conference().userJoins("ep-bob", null, named("bob"));
    s.hub.channel("bob").send(hello("ep-bob"));
    await flush();

    expect(s.joined).toEqual([]);
  });
});

describe("people in an open room who aren't in the world", () => {
  it("are told of after the grace, once each", async () => {
    vi.useFakeTimers();
    const s = setup();
    await join(s);

    s.conference().userJoins("ep-x", null);
    s.conference().userJoins("ep-bob", null, named("bob"));
    s.hub.channel("bob").send(hello("ep-bob"));
    await vi.advanceTimersByTimeAsync(GRACE);

    expect(s.outsiders).toBe(1);
    expect(s.errors.map(String)).toEqual([
      expect.stringMatching(/isn't in this world/),
    ]);
  });

  it("aren't told of once they left, or after leaving the room", async () => {
    vi.useFakeTimers();
    const s = setup();
    await join(s);

    s.conference().userJoins("ep-x", null);
    s.conference().userLeaves("ep-x");
    s.conference().userJoins("ep-y", null);
    await s.service.disconnect("user");
    await vi.advanceTimersByTimeAsync(GRACE);

    expect(s.outsiders).toBe(0);
  });
});
