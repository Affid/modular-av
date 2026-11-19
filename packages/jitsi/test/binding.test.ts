import { describe, expect, it } from "vitest";
import { createBinding, PRESENCE_KEY } from "../src/binding.ts";
import { MAX_CLAIMS_PER_SENDER } from "../src/binding-messages.ts";
import { createHub, type FakeHub } from "./fake-channel.ts";
import { participant } from "./fake-sdk.ts";

const ROOM = "ourtable";

/** Lets every queued message arrive. */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const claim = (endpoint: string, joinedAt = 1, type = "hello") => ({
  v: 1,
  type,
  room: ROOM,
  endpoint,
  joinedAt,
});

/** A participant whose presence names `user` (or nobody). */
const present = (endpoint: string, user?: string) => {
  const p = participant(endpoint, null);
  if (user !== undefined) p.setProperty(PRESENCE_KEY, user);
  return p;
};

function aliceOn(hub: FakeHub) {
  const claimed: string[] = [];
  const binding = createBinding({
    channel: hub.channel("alice"),
    room: ROOM,
    self: "alice",
    joinedAt: 100,
    onClaim: (endpoint) => claimed.push(endpoint),
  });
  return { binding, claimed };
}

describe("who an open server's participant is", () => {
  it("is the Foundry user who claimed the endpoint, when its presence names them too", async () => {
    // Arrange
    const hub = createHub();
    const { binding, claimed } = aliceOn(hub);

    // Act
    hub.channel("bob").send(claim("ep-bob", 42));
    await flush();

    // Assert
    expect(claimed).toEqual(["ep-bob"]);
    expect(binding.identify("ep-bob", present("ep-bob", "bob"))).toEqual({
      id: "bob",
      joinedAt: 42,
    });
  });

  it("is nobody when only one side speaks, or the two disagree", async () => {
    const hub = createHub();
    const { binding } = aliceOn(hub);

    hub.channel("mallory").send(claim("ep-bob"));
    hub.channel("bob").send(claim("ep-other"));
    await flush();

    // Mallory claims Bob's endpoint: its presence names Bob, not her.
    expect(binding.identify("ep-bob", present("ep-bob", "bob"))).toBeNull();
    // Someone outside the world names Bob in their presence; Bob never
    // claimed their endpoint.
    expect(binding.identify("ep-x", present("ep-x", "bob"))).toBeNull();
    // A claim and no presence.
    expect(binding.identify("ep-other", present("ep-other"))).toBeNull();
  });

  it("takes only a text naming the user from the presence", async () => {
    const hub = createHub();
    const { binding } = aliceOn(hub);
    hub.channel("bob").send(claim("ep-bob"));
    await flush();
    const odd = participant("ep-bob", null);
    odd.getProperty = () => ({ toString: () => "bob" });

    expect(binding.identify("ep-bob", odd)).toBeNull();
  });

  it("forgets an endpoint that left the room", async () => {
    const hub = createHub();
    const { binding } = aliceOn(hub);
    hub.channel("bob").send(claim("ep-bob"));
    await flush();

    binding.forget("ep-bob");

    expect(binding.identify("ep-bob", present("ep-bob", "bob"))).toBeNull();
  });
});

describe("telling the others who we are", () => {
  it("says hello with our endpoint once joined", () => {
    const hub = createHub();
    const { binding } = aliceOn(hub);

    binding.announce("ep-alice");

    expect(hub.sent).toEqual([
      {
        from: "alice",
        data: {
          v: 1,
          type: "hello",
          room: ROOM,
          endpoint: "ep-alice",
          joinedAt: 100,
        },
      },
    ]);
  });

  it("answers a hello to its sender only, and never a welcome", async () => {
    const hub = createHub();
    const { binding } = aliceOn(hub);
    binding.announce("ep-alice");
    const bob = hub.channel("bob");

    bob.send(claim("ep-bob", 5, "hello"));
    bob.send(claim("ep-bob", 5, "welcome"));
    await flush();

    const fromAlice = hub.sent.filter((s) => s.from === "alice");
    expect(fromAlice[0]?.data).toMatchObject({ type: "hello" });
    expect(fromAlice.slice(1)).toEqual([
      {
        from: "alice",
        data: {
          v: 1,
          type: "welcome",
          room: ROOM,
          endpoint: "ep-alice",
          joinedAt: 100,
        },
        recipients: ["bob"],
      },
    ]);
  });

  it("answers nobody before it has joined: its own hello comes then", async () => {
    const hub = createHub();
    aliceOn(hub);

    hub.channel("bob").send(claim("ep-bob"));
    await flush();

    expect(hub.sent.filter((s) => s.from === "alice")).toEqual([]);
  });
});

describe("what the binding refuses to read", () => {
  it.each([
    ["no object", "hello"],
    ["another version", { ...claim("ep-b"), v: 2 }],
    ["another room", { ...claim("ep-b"), room: "elsewhere" }],
    ["an unknown type", { ...claim("ep-b"), type: "bye" }],
    ["a strange endpoint", { ...claim("ep-b"), endpoint: "ep b<script>" }],
    ["a long endpoint", { ...claim("ep-b"), endpoint: "e".repeat(65) }],
    ["no join time", { ...claim("ep-b"), joinedAt: Number.NaN }],
    ["a text join time", { ...claim("ep-b"), joinedAt: "1" }],
  ])("drops %s", async (_what, data) => {
    const hub = createHub();
    const { binding, claimed } = aliceOn(hub);
    binding.announce("ep-alice");

    hub.inject("bob", data);
    await flush();

    expect(claimed).toEqual([]);
    expect(hub.sent.filter((s) => s.from === "alice")).toHaveLength(1);
  });

  it("keeps a sender's latest claims only", async () => {
    const hub = createHub();
    const { binding } = aliceOn(hub);
    const mallory = hub.channel("mallory");

    for (let i = 0; i <= MAX_CLAIMS_PER_SENDER; i += 1)
      mallory.send(claim(`ep-${String(i)}`));
    await flush();

    expect(binding.identify("ep-0", present("ep-0", "mallory"))).toBeNull();
    const last = `ep-${String(MAX_CLAIMS_PER_SENDER)}`;
    expect(binding.identify(last, present(last, "mallory"))).not.toBeNull();
  });

  it("listens no more once stopped", async () => {
    const hub = createHub();
    const { binding, claimed } = aliceOn(hub);

    binding.stop();
    hub.channel("bob").send(claim("ep-bob"));
    await flush();

    expect(claimed).toEqual([]);
    expect(binding.identify("ep-bob", present("ep-bob", "bob"))).toBeNull();
  });
});
