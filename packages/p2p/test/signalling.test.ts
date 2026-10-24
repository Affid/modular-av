import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "../src/messages.ts";
import { createSignalling, RATE_LIMIT } from "../src/signalling.ts";
import { createChannelHub } from "./channels.ts";

const ROOM = "world-1";
const USERS = new Set(["alice", "bob", "carol"]);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const hub = createChannelHub();
  const dropped: string[] = [];
  const make = (user: string, session: string) =>
    createSignalling({
      channel: hub.endpoint(user).channel,
      room: ROOM,
      session,
      isUser: (id) => USERS.has(id),
      now: () => Date.now(),
      onDropped: (sender) => dropped.push(sender),
    });
  return { hub, dropped, make };
}

const listen = (s: ReturnType<ReturnType<typeof setup>["make"]>) => {
  const got: [Signal, string][] = [];
  s.listen((signal, user) => got.push([signal, user]));
  return got;
};

describe("signalling", () => {
  it("says hello to everyone and welcomes one session", async () => {
    // Arrange
    const { make } = setup();
    const alice = make("alice", "s-a");
    const bob = make("bob", "s-b");
    const carol = make("carol", "s-c");
    const [atBob, atCarol] = [listen(bob), listen(carol)];

    // Act
    alice.broadcast({ type: "hello", joinedAt: 5 });
    bob.send("alice", { type: "welcome", to: "s-a", joinedAt: 6 });
    await vi.advanceTimersByTimeAsync(0);

    // Assert
    const hello = { v: 1, room: ROOM, from: "s-a", type: "hello", joinedAt: 5 };
    expect(atBob).toEqual([[hello, "alice"]]);
    expect(atCarol).toEqual([[hello, "alice"]]);
  });

  it("drops what is malformed, elsewhere, its own or for another session", async () => {
    // Arrange
    const { hub, make, dropped } = setup();
    const bob = make("bob", "s-b");
    const got = listen(bob);
    const raw = hub.endpoint("alice").channel;
    const base = { v: 1, room: ROOM, from: "s-a" };

    // Act
    raw.send({ ...base, type: "kick" });
    raw.send({ ...base, room: "other", type: "bye" });
    raw.send({ ...base, type: "bye", to: "s-other" });
    bob.broadcast({ type: "bye" });
    hub.endpoint("mallory").channel.send({ ...base, type: "bye" });
    raw.send({ ...base, type: "bye", to: "s-b" });
    await vi.advanceTimersByTimeAsync(0);

    // Assert
    expect(got).toEqual([[{ ...base, type: "bye", to: "s-b" }, "alice"]]);
    expect(dropped).toEqual(["alice", "mallory"]);
  });

  it("ignores a sender past the rate limit until the window passes", async () => {
    const { hub, make } = setup();
    const bob = make("bob", "s-b");
    const got = listen(bob);
    const raw = hub.endpoint("alice").channel;
    const bye = { v: 1, room: ROOM, from: "s-a", type: "bye" };

    for (let i = 0; i <= RATE_LIMIT.messages; i += 1) raw.send(bye);
    await vi.advanceTimersByTimeAsync(0);
    const within = got.length;
    await vi.advanceTimersByTimeAsync(RATE_LIMIT.windowMs);
    raw.send(bye);
    await vi.advanceTimersByTimeAsync(0);

    expect(within).toBe(RATE_LIMIT.messages);
    expect(got).toHaveLength(RATE_LIMIT.messages + 1);
  });

  it("stops delivering once the listener is removed", async () => {
    const { make } = setup();
    const alice = make("alice", "s-a");
    const bob = make("bob", "s-b");
    const got: unknown[] = [];
    const off = bob.listen((signal) => got.push(signal));

    off();
    alice.broadcast({ type: "bye" });
    await vi.advanceTimersByTimeAsync(0);

    expect(got).toEqual([]);
  });
});
