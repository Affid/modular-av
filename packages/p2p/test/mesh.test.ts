import type { ServiceEvents } from "@modular-av/api";
import { createFakeTrack, FakePeerConnection } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmitter } from "../src/emitter.ts";
import {
  createMesh,
  LEAVE_AFTER_MS,
  type Mesh,
  RESET_AFTER_MS,
} from "../src/mesh.ts";
import { createSignalling } from "../src/signalling.ts";
import { type ChannelHub, createChannelHub } from "./channels.ts";
import { describeArgs } from "./events.ts";

const ROOM = "world-1";

interface Member {
  readonly mesh: Mesh;
  readonly pcs: FakePeerConnection[];
  readonly events: string[];
  readonly errors: unknown[];
  yielded: number;
}

let hub: ChannelHub;

beforeEach(() => {
  vi.useFakeTimers();
  hub = createChannelHub();
});

afterEach(() => {
  vi.useRealTimers();
});

function member(user: string, session: string, joinedAt = 100): Member {
  const signalling = createSignalling({
    channel: hub.endpoint(user).channel,
    room: ROOM,
    session,
    isUser: () => true,
    now: () => Date.now(),
    onDropped: () => undefined,
  });
  const events: string[] = [];
  const errors: unknown[] = [];
  const emitter = createEmitter((error) => errors.push(error));
  const record =
    (name: keyof ServiceEvents) =>
    (...args: unknown[]): void => {
      events.push(`${name} ${describeArgs(args)}`);
    };
  for (const name of [
    "participantJoined",
    "participantLeft",
    "trackAdded",
    "trackRemoved",
    "quality",
  ] as const)
    emitter.on(name, record(name));
  const pcs: FakePeerConnection[] = [];
  const self: Member = {
    pcs,
    events,
    errors,
    yielded: 0,
    mesh: createMesh({
      self: { user, session, joinedAt },
      signalling,
      createPeerConnection: () => {
        const pc = new FakePeerConnection();
        pcs.push(pc);
        return pc;
      },
      events: emitter,
      now: () => Date.now(),
      onYield: () => {
        self.yielded += 1;
      },
      onChange: () => undefined,
      onError: (error) => errors.push(error),
    }),
  };
  signalling.listen((signal, sender) => {
    self.mesh.handle(signal, sender);
  });
  return self;
}

/** A zero timeout set inside a timer runs a fake millisecond later. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 40; i += 1) await vi.advanceTimersByTimeAsync(1);
};

const joined = (m: Member): string[] =>
  m.events.filter((e) => e.startsWith("participant"));

describe("the mesh", () => {
  it("links everyone who says hello, and each sees the others join", async () => {
    // Arrange
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    const carol = member("carol", "s-c");

    // Act
    for (const m of [alice, bob, carol]) m.mesh.hello();
    await settle();

    // Assert
    expect(joined(alice).sort()).toEqual([
      "participantJoined bob",
      "participantJoined carol",
    ]);
    expect(joined(carol).sort()).toEqual([
      "participantJoined alice",
      "participantJoined bob",
    ]);
    expect(alice.mesh.linkStates()).toEqual(["connected", "connected"]);
    expect([...bob.mesh.roster.members.keys()].sort()).toEqual([
      "alice",
      "carol",
    ]);
    expect([alice.errors, bob.errors, carol.errors]).toEqual([[], [], []]);
  });

  it("reports the others' tracks while they send them", async () => {
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    alice.mesh.hello();
    bob.mesh.hello();
    await settle();

    await alice.mesh.setTrack("microphone", createFakeTrack("audio"));
    await settle();
    const added = bob.events.filter((e) => e.startsWith("track"));
    await alice.mesh.setTrack("microphone", null);
    await settle();

    expect(added).toEqual(["trackAdded alice:microphone"]);
    expect(bob.events.at(-1)).toBe("trackRemoved alice:microphone");
  });

  it("sends tracks set before a link existed", async () => {
    const alice = member("alice", "s-a");
    await alice.mesh.setTrack("camera", createFakeTrack("video"));
    const bob = member("bob", "s-b");

    alice.mesh.hello();
    bob.mesh.hello();
    await settle();

    expect(bob.events).toContain("trackAdded alice:camera");
  });

  it("lets the others go when they say goodbye or Foundry says they left", async () => {
    // Arrange
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    const carol = member("carol", "s-c");
    for (const m of [alice, bob, carol]) m.mesh.hello();
    await settle();
    await bob.mesh.setTrack("microphone", createFakeTrack("audio"));
    await settle();

    // Act
    bob.mesh.bye();
    await settle();
    alice.mesh.userLeft("carol");

    // Assert
    expect(alice.events.slice(-3)).toEqual([
      "trackRemoved bob:microphone",
      "participantLeft bob",
      "participantLeft carol",
    ]);
    expect(alice.mesh.roster.members.size).toBe(0);
  });

  it("takes a player's new session in place of the old one", async () => {
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b1", 200);
    alice.mesh.hello();
    bob.mesh.hello();
    await settle();

    bob.mesh.close();
    member("bob", "s-b2", 300).mesh.hello();
    await settle();

    expect(joined(alice)).toEqual([
      "participantJoined bob",
      "participantLeft bob",
      "participantJoined bob",
    ]);
  });

  it("gives way to a newer tab of the same player, whoever spoke first", async () => {
    const older = member("alice", "s-a1", 100);
    older.mesh.hello();
    await settle();

    const newer = member("alice", "s-a2", 200);
    newer.mesh.hello();
    await settle();
    const late = member("alice", "s-a0", 50);
    late.mesh.hello();
    await settle();

    expect([older.yielded, newer.yielded, late.yielded]).toEqual([1, 0, 1]);
  });

  it("marks a broken link lost, lets them go after a while and starts afresh", async () => {
    // Arrange
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    alice.mesh.hello();
    bob.mesh.hello();
    await settle();

    // Act
    for (const pc of [...alice.pcs, ...bob.pcs]) pc.cut("failed");
    await settle();
    const lost = alice.events.at(-1);
    await vi.advanceTimersByTimeAsync(RESET_AFTER_MS);
    await settle();

    // Assert
    expect(lost).toBe("quality bob lost");
    expect(bob.pcs).toHaveLength(2);
    expect(alice.pcs).toHaveLength(2);
    expect(alice.mesh.linkStates()).toEqual(["connected"]);
    expect(alice.events.at(-1)).toBe("quality bob good");
    expect(joined(alice)).toEqual(["participantJoined bob"]);
  });

  it("reports them gone when the link stays down", async () => {
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    alice.mesh.hello();
    bob.mesh.hello();
    await settle();
    await bob.mesh.setTrack("microphone", createFakeTrack("audio"));
    await settle();
    hub.paused = true;

    for (const pc of [...alice.pcs, ...bob.pcs]) pc.cut("failed");
    await vi.advanceTimersByTimeAsync(LEAVE_AFTER_MS);
    await settle();

    expect(alice.events.slice(-2)).toEqual([
      "trackRemoved bob:microphone",
      "participantLeft bob",
    ]);
    expect(alice.mesh.linkStates()).toEqual(["down"]);
  });

  it("keeps a refusal across links and drops stale or unknown messages", async () => {
    // Arrange
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    alice.mesh.setRefused("bob", "microphone", true);
    await bob.mesh.setTrack("microphone", createFakeTrack("audio"));
    alice.mesh.hello();
    bob.mesh.hello();
    await settle();
    const line = (): string | null | undefined =>
      bob.pcs
        .at(-1)
        ?.getTransceivers()
        .find((t) => t.sender.track !== null)?.currentDirection;

    // Act
    const before = line();
    alice.mesh.handle(
      {
        v: 1,
        room: ROOM,
        from: "s-stranger",
        type: "sources",
        to: "s-a",
        epoch: 0,
        sources: {},
      },
      "bob",
    );
    for (const pc of [...alice.pcs, ...bob.pcs]) pc.cut("failed");
    await vi.advanceTimersByTimeAsync(RESET_AFTER_MS);
    await settle();

    // Assert
    expect(before).toBe("inactive");
    expect(line()).toBe("inactive");
    expect(alice.events).toContain("trackAdded bob:microphone");
  });

  it("rates connected links and averages them for the call's stats", async () => {
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    alice.mesh.hello();
    bob.mesh.hello();
    await settle();
    const pc = alice.pcs[0];
    if (!pc) throw new Error("no link");
    pc.stats = { roundTripMs: 500, packetsLost: 0, packetsReceived: 10 };

    const stats = await alice.mesh.sampleStats();
    await alice.mesh.sampleStats();

    expect(stats).toEqual({ roundTripMs: 500, packetLoss: 0 });
    expect(alice.events.filter((e) => e.startsWith("quality"))).toEqual([
      "quality bob poor",
    ]);
  });

  it("hands new ICE servers to every link", async () => {
    const alice = member("alice", "s-a");
    const bob = member("bob", "s-b");
    alice.mesh.hello();
    bob.mesh.hello();
    await settle();

    alice.mesh.setConfiguration({ iceTransportPolicy: "relay" });

    expect(alice.pcs[0]?.configuration).toEqual({
      iceTransportPolicy: "relay",
    });
  });
});
