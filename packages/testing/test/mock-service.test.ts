import type { ServiceConnection, ServiceEvents } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import { createFakeTrack, fakeTrackInfo } from "../src/service/fake-track.ts";
import {
  createMockServiceHub,
  MockServiceFailure,
} from "../src/service/hub.ts";

const ROOM = { name: "world-1" };

async function join(
  hub: ReturnType<typeof createMockServiceHub>,
  participant: string,
): Promise<ServiceConnection> {
  const connection = await hub.definition().create({ participant });
  const token = hub.signToken({
    participant,
    room: ROOM.name,
    canPublish: { audio: true, video: true },
    ttlSeconds: 600,
  });
  await connection.connect(ROOM, token, new AbortController().signal);
  return connection;
}

function record(
  connection: ServiceConnection,
  event: keyof ServiceEvents,
): unknown[][] {
  const calls: unknown[][] = [];
  connection.on(event, (...args: unknown[]) => calls.push(args));
  return calls;
}

describe("mock service", () => {
  it("connects with a valid token and reports connected", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const connection = await hub.definition().create({ participant: "p1" });
    const states = record(connection, "state");
    const token = hub.signToken({
      participant: "p1",
      room: ROOM.name,
      canPublish: { audio: true, video: true },
      ttlSeconds: 60,
    });

    // Act
    await connection.connect(ROOM, token, new AbortController().signal);

    // Assert
    expect(states.map(([s]) => s)).toEqual(["connecting", "connected"]);
    expect(hub.participants(ROOM.name)).toEqual(["p1"]);
  });

  it("rejects a token signed for someone else with a final auth error", async () => {
    const hub = createMockServiceHub();
    const connection = await hub.definition().create({ participant: "p1" });
    const token = hub.signToken({
      participant: "p2",
      room: ROOM.name,
      canPublish: { audio: true, video: true },
      ttlSeconds: 60,
    });

    const result = connection.connect(
      ROOM,
      token,
      new AbortController().signal,
    );

    await expect(result).rejects.toBeInstanceOf(MockServiceFailure);
    await expect(result).rejects.toMatchObject({
      serviceError: { code: "auth", final: true },
    });
  });

  it("rejects garbage and expired tokens", async () => {
    let now = 1_000_000;
    const hub = createMockServiceHub({ now: () => now });
    const connection = await hub.definition().create({ participant: "p1" });
    const token = hub.signToken({
      participant: "p1",
      room: ROOM.name,
      canPublish: { audio: true, video: true },
      ttlSeconds: 1,
    });
    now += 2000;
    const signal = new AbortController().signal;

    await expect(
      connection.connect(ROOM, "nonsense", signal),
    ).rejects.toMatchObject({
      serviceError: { code: "auth" },
    });
    await expect(connection.connect(ROOM, token, signal)).rejects.toMatchObject(
      {
        serviceError: { code: "token-expired", final: false },
      },
    );
  });

  it("says whether it needs a token", () => {
    expect(createMockServiceHub().definition().needsToken()).toBe(true);
    expect(
      createMockServiceHub({ needsToken: false }).definition().needsToken(),
    ).toBe(false);
  });

  it("joins with no token and full rights when it needs none", async () => {
    // Arrange
    const hub = createMockServiceHub({ needsToken: false });
    const connection = await hub.definition().create({ participant: "p1" });
    await connection.connect(ROOM, null, new AbortController().signal);

    // Act
    const published = await connection.publish(
      createFakeTrack("video"),
      "camera",
    );

    // Assert
    expect(hub.participants(ROOM.name)).toEqual(["p1"]);
    expect(published.source).toBe("camera");
  });

  it("refuses a missing token for good when it needs one", async () => {
    const hub = createMockServiceHub();
    const connection = await hub.definition().create({ participant: "p1" });

    await expect(
      connection.connect(ROOM, null, new AbortController().signal),
    ).rejects.toMatchObject({ serviceError: { code: "auth", final: true } });
  });

  it("stops connecting when aborted", async () => {
    const hub = createMockServiceHub();
    const connection = await hub.definition().create({ participant: "p1" });
    const controller = new AbortController();
    controller.abort();

    await expect(
      connection.connect(ROOM, "x", controller.signal),
    ).rejects.toThrow(/abort/i);
    expect(hub.participants(ROOM.name)).toEqual([]);
  });

  it("delivers published tracks to others, including late joiners", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const mic = createFakeTrack("audio");
    await alice.publish(mic, "microphone");

    const bob = await hub.definition().create({ participant: "bob" });
    const added = record(bob, "trackAdded");
    const joined = record(bob, "participantJoined");
    await bob.connect(
      ROOM,
      hub.signToken({
        participant: "bob",
        room: ROOM.name,
        canPublish: { audio: true, video: true },
        ttlSeconds: 60,
      }),
      new AbortController().signal,
    );

    expect(joined).toEqual([["alice"]]);
    expect(added).toEqual([
      [{ participant: "alice", source: "microphone", track: mic }],
    ]);
  });

  it("refuses to publish a source the token does not allow", async () => {
    const hub = createMockServiceHub();
    const connection = await hub.definition().create({ participant: "p1" });
    await connection.connect(
      ROOM,
      hub.signToken({
        participant: "p1",
        room: ROOM.name,
        canPublish: { audio: false, video: true },
        ttlSeconds: 60,
      }),
      new AbortController().signal,
    );

    await expect(
      connection.publish(createFakeTrack("audio"), "microphone"),
    ).rejects.toThrow(/not allowed/);
  });

  it("refuses to publish while not connected", async () => {
    const hub = createMockServiceHub();
    const connection = await hub.definition().create({ participant: "p1" });

    await expect(
      connection.publish(createFakeTrack("audio"), "microphone"),
    ).rejects.toThrow(/not connected/);
  });

  it("swaps a published track for the others", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const bob = await join(hub, "bob");
    const removed = record(bob, "trackRemoved");
    const added = record(bob, "trackAdded");
    const first = createFakeTrack("video");
    const second = createFakeTrack("video");
    const published = await alice.publish(first, "camera");

    await alice.replaceTrack(published, second);

    expect(added.map(([t]) => (t as { track: unknown }).track)).toEqual([
      first,
      second,
    ]);
    expect(removed.map(([t]) => (t as { track: unknown }).track)).toEqual([
      first,
    ]);
  });

  it("stops sending a track on unpublish without stopping it", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const bob = await join(hub, "bob");
    const removed = record(bob, "trackRemoved");
    const track = createFakeTrack("video");
    const published = await alice.publish(track, "camera");

    // Act
    await alice.unpublish(published);
    await alice.unpublish(published);

    // Assert
    expect(removed.map(([t]) => (t as { track: unknown }).track)).toEqual([
      track,
    ]);
    expect(fakeTrackInfo(track).readyState).toBe("live");
    await expect(alice.replaceTrack(published, track)).rejects.toThrow(
      /Unknown published track/,
    );
  });

  it("records mute signalling and subscriptions without touching tracks", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const mic = createFakeTrack("audio");
    const published = await alice.publish(mic, "microphone");

    await alice.setMuted(published, true);
    alice.setSubscription("bob", "camera", { enabled: false });

    expect(hub.isMuted("alice", "microphone")).toBe(true);
    expect(hub.subscription("alice", "bob", "camera")).toEqual({
      enabled: false,
    });
    expect(fakeTrackInfo(mic)).toMatchObject({ enabled: true, stopCalls: 0 });
  });

  it("models an outage: resuming, then recovered or lost", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const bob = await join(hub, "bob");
    const states = record(alice, "state");
    const left = record(bob, "participantLeft");

    hub.startOutage("alice");
    hub.endOutage("alice");
    hub.startOutage("alice");
    hub.loseConnection("alice");

    expect(states).toEqual([
      ["resuming"],
      ["connected"],
      ["resuming"],
      ["lost", { code: "network", final: false }],
    ]);
    expect(left).toEqual([["alice"]]);
    expect(hub.participants(ROOM.name)).toEqual(["bob"]);
  });

  it("ends the older connection with a final duplicate error", async () => {
    const hub = createMockServiceHub();
    const oldTab = await join(hub, "alice");
    const states = record(oldTab, "state");

    await join(hub, "alice");

    expect(states).toEqual([["failed", { code: "duplicate", final: true }]]);
    expect(hub.participants(ROOM.name)).toEqual(["alice"]);
  });

  it("kicks, closes rooms and warns about token expiry", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const bob = await join(hub, "bob");
    const aliceStates = record(alice, "state");
    const bobStates = record(bob, "state");
    const expiring = record(bob, "tokenExpiring");

    hub.warnTokenExpiring("bob");
    hub.kick("alice");
    hub.closeRoom(ROOM.name);

    expect(expiring).toHaveLength(1);
    expect(aliceStates).toEqual([["failed", { code: "kicked", final: true }]]);
    expect(bobStates).toEqual([
      ["failed", { code: "room-closed", final: true }],
    ]);
  });

  it("relays speaking to the others", async () => {
    const hub = createMockServiceHub();
    await join(hub, "alice");
    const bob = await join(hub, "bob");
    const speaking = record(bob, "speaking");

    hub.setSpeaking("alice", true);

    expect(speaking).toEqual([["alice", true]]);
  });

  it("leaves on disconnect and stops sending events after unsubscribe", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const bob = await join(hub, "bob");
    const handler = vi.fn();
    const off = bob.on("participantLeft", handler);
    const states = record(alice, "state");

    await alice.disconnect("user");
    off();
    await (await join(hub, "carol")).disconnect("user");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(states).toEqual([["disconnected"]]);
  });

  it("offers moderation when asked, and reports capabilities and stats", async () => {
    const hub = createMockServiceHub({ moderation: true });
    const gm = await join(hub, "gm");
    const alice = await join(hub, "alice");
    const states = record(alice, "state");
    await alice.publish(createFakeTrack("audio"), "microphone");

    await gm.moderation?.forceMute("alice", "microphone");
    const mutedBeforeRemoval = hub.isMuted("alice", "microphone");
    await gm.moderation?.remove("alice");

    expect(gm.capabilities.get().moderation).toBe(true);
    expect(mutedBeforeRemoval).toBe(true);
    expect(states).toEqual([["failed", { code: "kicked", final: true }]]);
    expect(await gm.getStats()).toEqual({ roundTripMs: 20, packetLoss: 0 });
  });

  it("has no moderation by default", async () => {
    const hub = createMockServiceHub();
    const connection = await join(hub, "p1");
    const seen = vi.fn();

    connection.capabilities.subscribe(seen);

    expect(connection.moderation).toBeUndefined();
    expect(connection.capabilities.get().moderation).toBe(false);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("mock service edge cases", () => {
  it("stops a connect aborted during the network wait", async () => {
    // Arrange
    const hub = createMockServiceHub();
    const connection = await hub.definition().create({ participant: "p1" });
    const controller = new AbortController();
    const token = hub.signToken({
      participant: "p1",
      room: ROOM.name,
      canPublish: { audio: true, video: true },
      ttlSeconds: 60,
    });

    // Act
    const result = connection.connect(ROOM, token, controller.signal);
    controller.abort();

    // Assert
    await expect(result).rejects.toThrow(/abort/i);
    expect(hub.participants(ROOM.name)).toEqual([]);
  });

  it("says so when connecting twice", async () => {
    const hub = createMockServiceHub();
    const connection = await join(hub, "p1");

    await expect(
      connection.connect(ROOM, "x", new AbortController().signal),
    ).rejects.toThrow(/already connected/);
  });

  it("keeps the final state when disconnecting after a failure", async () => {
    const hub = createMockServiceHub();
    const connection = await join(hub, "p1");
    hub.kick("p1");
    const states = record(connection, "state");

    await connection.disconnect("user");

    expect(states).toEqual([]);
  });

  it("forgets mute and subscriptions when a participant leaves", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const mic = await alice.publish(createFakeTrack("audio"), "microphone");
    await alice.setMuted(mic, true);
    alice.setSubscription("bob", "camera", { enabled: false });

    await alice.disconnect("user");

    expect(hub.isMuted("alice", "microphone")).toBe(false);
    expect(hub.subscription("alice", "bob", "camera")).toBeUndefined();
  });

  it("lists the joiner in the room before telling the others", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    let seen: readonly string[] = [];
    alice.on("participantJoined", () => {
      seen = hub.participants(ROOM.name);
    });

    await join(hub, "bob");

    expect(seen).toEqual(["alice", "bob"]);
  });

  it("isolates a throwing handler and removes only one registration", async () => {
    const hub = createMockServiceHub();
    const alice = await join(hub, "alice");
    const handler = vi.fn();
    alice.on("participantJoined", () => {
      throw new Error("ui bug");
    });
    alice.on("participantJoined", handler);
    const off = alice.on("participantJoined", handler);
    off();

    await join(hub, "bob");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(hub.errors).toHaveLength(1);
    expect(hub.participants(ROOM.name)).toEqual(["alice", "bob"]);
  });
});

describe("fake tracks", () => {
  it("behave like live tracks that can be disabled, cloned and stopped", () => {
    const track = createFakeTrack("video", "cam");

    track.enabled = false;
    const copy = track.clone();
    track.stop();

    expect(fakeTrackInfo(track)).toEqual({
      enabled: false,
      readyState: "ended",
      stopCalls: 1,
    });
    expect(copy.kind).toBe("video");
    expect(copy.label).toBe("cam");
    expect(copy.id).not.toBe(track.id);
    expect(copy.readyState).toBe("live");
  });

  it("are recognised only when fake", () => {
    expect(() => fakeTrackInfo({} as MediaStreamTrack)).toThrow(
      /not a fake track/,
    );
  });
});
