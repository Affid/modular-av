import type { ServiceConnection, ServiceEvents } from "@modular-av/api";
import {
  createFakeTrack,
  FakePeerConnection,
  fakeTrackInfo,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createP2PConnection,
  DISCOVERY_MS,
  HELLO_AGAIN_MS,
  LOST_AFTER_MS,
  STATS_EVERY_MS,
} from "../src/connection.ts";
import { type ChannelHub, createChannelHub } from "./channels.ts";
import { describeArgs } from "./events.ts";

const ROOM = { name: "world-1" };
const GMS = new Set(["gm"]);

interface Player {
  readonly connection: ServiceConnection;
  readonly pcs: FakePeerConnection[];
  readonly events: string[];
  readonly errors: unknown[];
  readonly iceListeners: (() => void)[];
  readonly leftListeners: ((user: string) => void)[];
}

let hub: ChannelHub;
let cap: number;
let session: number;

beforeEach(() => {
  vi.useFakeTimers();
  hub = createChannelHub();
  cap = 6;
  session = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

function player(user: string, joinedAt = Date.now()): Player {
  const pcs: FakePeerConnection[] = [];
  const events: string[] = [];
  const errors: unknown[] = [];
  const iceListeners: (() => void)[] = [];
  const leftListeners: ((user: string) => void)[] = [];
  const connection = createP2PConnection(
    { participant: user },
    {
      channel: hub.endpoint(user).channel,
      createPeerConnection: (configuration) => {
        const pc = new FakePeerConnection(configuration);
        pcs.push(pc);
        return pc;
      },
      iceConfiguration: () => ({ iceServers: [] }),
      onIceChange: (listener) => {
        iceListeners.push(listener);
        return () => undefined;
      },
      onUserLeft: (listener) => {
        leftListeners.push(listener);
        return () => undefined;
      },
      isUser: () => true,
      isGM: (id) => GMS.has(id),
      maxParticipants: () => cap,
      joinedAt: () => joinedAt,
      now: () => Date.now(),
      randomId: () => `s${String((session += 1))}`,
      onError: (error) => errors.push(error),
    },
  );
  const names: (keyof ServiceEvents)[] = [
    "state",
    "participantJoined",
    "participantLeft",
    "trackAdded",
    "trackRemoved",
    "quality",
  ];
  for (const name of names)
    connection.on(name, (...args: unknown[]) => {
      events.push(`${name} ${describeArgs(args)}`);
    });
  return { connection, pcs, events, errors, iceListeners, leftListeners };
}

const settle = async (ms = DISCOVERY_MS + 100): Promise<void> => {
  for (let i = 0; i < 40; i += 1) await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 40; i += 1) await vi.advanceTimersByTimeAsync(1);
};

async function join(p: Player): Promise<void> {
  const joining = p.connection.connect(
    ROOM,
    null,
    new AbortController().signal,
  );
  await settle();
  await joining;
}

const states = (p: Player): string[] =>
  p.events.filter((e) => e.startsWith("state"));

describe("joining", () => {
  it("joins after listening for the others, and links with them", async () => {
    // Arrange
    const alice = player("alice");
    const bob = player("bob");

    // Act
    await join(alice);
    await join(bob);

    // Assert
    expect(states(alice)).toEqual(["state connected"]);
    expect(alice.events).toContain("participantJoined bob");
    expect(bob.events).toContain("participantJoined alice");
    expect(alice.connection.capabilities.get()).toEqual({
      moderation: false,
      speakingDetection: false,
      simulcast: false,
    });
    expect([alice.errors, bob.errors]).toEqual([[], []]);
  });

  it("says hello again, so a lost welcome still ends in a link", async () => {
    const alice = player("alice");
    await join(alice);
    hub.drop = (data, user) =>
      user === "alice" && (data as { type?: string }).type === "welcome";
    const bob = player("bob");
    await join(bob);
    hub.drop = null;

    await settle(Math.max(...HELLO_AGAIN_MS));

    expect(bob.events).toContain("participantJoined alice");
    expect(alice.events).toContain("participantJoined bob");
  });

  it("counts a player whose welcome came late against the cap", async () => {
    cap = 2;
    await join(player("alice", 100));
    await join(player("bob", 200));
    hub.drop = (data) => (data as { type?: string }).type === "welcome";
    const carol = player("carol", 300);
    await join(carol);
    hub.drop = null;

    await settle(Math.max(...HELLO_AGAIN_MS));

    expect(states(carol).at(-1)).toBe("state failed full");
  });

  it("turns away a player past the cap for good, never a GM", async () => {
    cap = 2;
    await join(player("alice"));
    await join(player("bob"));
    const carol = player("carol");
    const gm = player("gm");

    const refused = carol.connection.connect(
      ROOM,
      null,
      new AbortController().signal,
    );
    const caught = refused.catch((error: unknown) => error);
    await settle();
    await join(gm);

    expect(await caught).toMatchObject({
      serviceError: { code: "full", final: true },
    });
    expect(states(gm)).toEqual(["state connected"]);
  });

  it("leaves by itself once a GM's arrival puts it past the cap", async () => {
    cap = 2;
    const alice = player("alice", 100);
    const bob = player("bob", 200);
    await join(alice);
    await join(bob);
    const carol = player("carol", 250);
    const refused = carol.connection
      .connect(ROOM, null, new AbortController().signal)
      .catch((error: unknown) => error);
    await settle();
    expect(await refused).toMatchObject({ serviceError: { code: "full" } });

    await join(player("gm", 300));

    expect(states(bob).at(-1)).toBe("state failed full");
    expect(states(alice)).toEqual(["state connected"]);
  });

  it("gives way to a newer tab of the same player for good", async () => {
    const older = player("alice", 100);
    await join(older);

    await join(player("alice", 200));

    expect(states(older).at(-1)).toBe("state failed duplicate");
  });

  it("refuses to join twice and stops when aborted", async () => {
    const alice = player("alice");
    await join(alice);
    const bob = player("bob");
    const controller = new AbortController();

    const twice = alice.connection
      .connect(ROOM, null, new AbortController().signal)
      .catch((error: unknown) => error);
    const aborted = bob.connection.connect(ROOM, null, controller.signal);
    const caught = aborted.catch((error: unknown) => error);
    controller.abort();
    await settle();

    expect(await twice).toMatchObject({ message: /already/ });
    expect(await caught).toMatchObject({ name: "AbortError" });
  });
});

describe("media", () => {
  it("publishes the core's tracks to everyone, never stopping them", async () => {
    // Arrange
    const alice = player("alice");
    const bob = player("bob");
    await join(alice);
    await join(bob);
    const mic = createFakeTrack("audio");

    // Act
    const published = await alice.connection.publish(mic, "microphone");
    await alice.connection.setMuted(published, true);
    await settle(0);
    const added = bob.events.filter((e) => e.startsWith("track"));
    const headset = createFakeTrack("audio");
    await alice.connection.replaceTrack(published, headset);
    await alice.connection.unpublish(published);
    await alice.connection.unpublish(published);
    await settle(0);

    // Assert
    expect(published.source).toBe("microphone");
    expect(added).toEqual(["trackAdded alice:microphone"]);
    expect(bob.events.at(-1)).toBe("trackRemoved alice:microphone");
    expect(fakeTrackInfo(mic).stopCalls).toBe(0);
    await expect(
      alice.connection.publish(createFakeTrack("video"), "screen"),
    ).rejects.toThrow(/screen/);
  });

  it("refuses a participant's source when the core says so", async () => {
    const alice = player("alice");
    const bob = player("bob");
    await join(alice);
    await join(bob);
    await bob.connection.publish(createFakeTrack("audio"), "microphone");
    await settle(0);

    alice.connection.setSubscription("bob", "microphone", { enabled: false });
    await settle(0);

    const line = bob.pcs[0]
      ?.getTransceivers()
      .find((t) => t.sender.track !== null);
    expect(line?.currentDirection).toBe("inactive");
  });
});

describe("staying connected", () => {
  it("resumes while every link is down, and comes back when one returns", async () => {
    const alice = player("alice");
    const bob = player("bob");
    await join(alice);
    await join(bob);

    for (const pc of alice.pcs) pc.cut();
    await settle(0);
    for (const pc of alice.pcs) pc.restore();
    await settle(0);

    expect(states(alice)).toEqual([
      "state connected",
      "state resuming",
      "state connected",
    ]);
  });

  it("gives up once, as lost, when the links stay down", async () => {
    const alice = player("alice");
    const bob = player("bob");
    await join(alice);
    await join(bob);
    hub.paused = true;

    for (const pc of alice.pcs) pc.cut("failed");
    await settle(LOST_AFTER_MS);

    expect(states(alice)).toEqual([
      "state connected",
      "state resuming",
      "state lost network",
    ]);
  });

  it("rates each link while connected and reports the call's stats", async () => {
    const alice = player("alice");
    const bob = player("bob");
    await join(alice);
    await join(bob);
    const pc = alice.pcs[0];
    if (!pc) throw new Error("no link");
    pc.stats = { roundTripMs: 400, packetsLost: 0, packetsReceived: 10 };

    await settle(STATS_EVERY_MS);

    expect(alice.events).toContain("quality bob poor");
    expect(await alice.connection.getStats()).toMatchObject({
      roundTripMs: 400,
    });
  });

  it("follows Foundry: new ICE servers and players who left", async () => {
    const alice = player("alice");
    const bob = player("bob");
    await join(alice);
    await join(bob);

    for (const listener of alice.iceListeners) listener();
    for (const listener of alice.leftListeners) listener("bob");

    expect(alice.pcs[0]?.restarts).toBe(1);
    expect(alice.events.at(-1)).toBe("participantLeft bob");
  });

  it("leaves on purpose: the others see it, the tracks stay live", async () => {
    // Arrange
    const alice = player("alice");
    const bob = player("bob");
    await join(alice);
    await join(bob);
    const mic = createFakeTrack("audio");
    await alice.connection.publish(mic, "microphone");
    await settle(0);

    // Act
    await alice.connection.disconnect("user");
    await alice.connection.disconnect("user");
    await settle(0);

    // Assert
    expect(states(alice).at(-1)).toBe("state disconnected");
    expect(bob.events.slice(-2)).toEqual([
      "trackRemoved alice:microphone",
      "participantLeft alice",
    ]);
    expect(fakeTrackInfo(mic).readyState).toBe("live");
  });
});
