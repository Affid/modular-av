import { describe, expect, it } from "vitest";
import { createBinding, PRESENCE_KEY } from "../src/binding.ts";
import { MAX_CLAIMS_PER_SENDER } from "../src/binding-messages.ts";
import { WELCOME_BURST, WELCOME_REFILL_MS } from "../src/welcome-limit.ts";
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

/** `inRoom`: the endpoints Alice's conference has when she joins. */
function aliceOn(
  hub: FakeHub,
  inRoom: (endpoint: string) => boolean = () => true,
) {
  const claimed: string[] = [];
  let reconnected: readonly (() => void)[] = [];
  let time = 0;
  const binding = createBinding({
    channel: hub.channel("alice"),
    room: ROOM,
    self: "alice",
    joinedAt: 100,
    isPresent: inRoom,
    now: () => time,
    onClaim: (endpoint) => claimed.push(endpoint),
    onReconnect: (listener) => {
      reconnected = [...reconnected, listener];
      return () => {
        reconnected = reconnected.filter((l) => l !== listener);
      };
    },
  });
  /** Foundry's socket connected again, as socket.io's "connect" says. */
  const reconnect = (): void => {
    for (const listener of reconnected) listener();
  };
  const advance = (ms: number): void => {
    time += ms;
  };
  return { binding, claimed, reconnect, advance };
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

  it("drops a claim from before it joined on an endpoint no longer in the room", async () => {
    // Arrange: Bob joined and left while Alice was still connecting, so
    // she never saw him leave; Carol is there.
    const hub = createHub();
    const { binding } = aliceOn(hub, (endpoint) => endpoint === "ep-carol");
    hub.channel("bob").send(claim("ep-bob"));
    hub.channel("carol").send(claim("ep-carol"));
    await flush();

    // Act
    binding.announce("ep-alice");

    // Assert: whoever takes Bob's old name and names him gets no place.
    expect(binding.identify("ep-bob", present("ep-bob", "bob"))).toBeNull();
    expect(
      binding.identify("ep-carol", present("ep-carol", "carol")),
    ).not.toBeNull();
  });

  it("takes a dropped claim again from the welcome that answers its hello", async () => {
    // Dave's presence hadn't come yet when Alice joined.
    const hub = createHub();
    const { binding } = aliceOn(hub, () => false);
    hub.channel("dave").send(claim("ep-dave"));
    await flush();
    binding.announce("ep-alice");

    hub.channel("dave").send(claim("ep-dave", 1, "welcome"));
    await flush();

    expect(
      binding.identify("ep-dave", present("ep-dave", "dave")),
    ).not.toBeNull();
  });

  it("takes no late claim on an endpoint that already left", async () => {
    // A claim that comes after its endpoint left would place whoever takes
    // that name next and names Bob in their presence.
    const hub = createHub();
    const { binding, claimed } = aliceOn(hub);

    binding.forget("ep-bob");
    hub.channel("bob").send(claim("ep-bob"));
    await flush();

    expect(claimed).toEqual([]);
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

  it("acts on each claim once, and answers every hello: its sender may have missed ours", async () => {
    // Arrange
    const hub = createHub();
    const { binding, claimed } = aliceOn(hub);
    binding.announce("ep-alice");
    const bob = hub.channel("bob");

    // Act
    for (let i = 0; i < 3; i += 1) bob.send(claim("ep-bob", 5 + i));
    bob.send(claim("ep-bob-reloaded", 9));
    await flush();

    // Assert
    const welcomes = hub.sent.filter(
      (s) => s.from === "alice" && s.recipients !== undefined,
    );
    expect(welcomes).toHaveLength(4);
    expect(claimed).toEqual(["ep-bob", "ep-bob-reloaded"]);
  });

  it("answers a sender's hellos up to a burst, then one every couple of seconds", async () => {
    // Arrange
    const hub = createHub();
    const { binding, advance } = aliceOn(hub);
    binding.announce("ep-alice");
    const welcomesTo = (user: string): number =>
      hub.sent.filter((s) => s.from === "alice" && s.recipients?.[0] === user)
        .length;

    // Act: a modified client keeps saying hello.
    for (let i = 0; i < WELCOME_BURST + 2; i += 1)
      hub.channel("mallory").send(claim(`ep-${String(i)}`));
    hub.channel("bob").send(claim("ep-bob"));
    await flush();
    const inBurst = welcomesTo("mallory");
    advance(WELCOME_REFILL_MS);
    hub.channel("mallory").send(claim("ep-later"));
    await flush();

    // Assert
    expect(inBurst).toBe(WELCOME_BURST);
    expect(welcomesTo("mallory")).toBe(WELCOME_BURST + 1);
    expect(welcomesTo("bob")).toBe(1);
  });

  it("answers no hello from an endpoint that already left", async () => {
    const hub = createHub();
    const { binding } = aliceOn(hub);
    binding.announce("ep-alice");

    binding.forget("ep-bob");
    hub.channel("bob").send(claim("ep-bob"));
    await flush();

    expect(hub.sent.filter((s) => s.from === "alice")).toHaveLength(1);
  });

  it("says hello again once Foundry's socket reconnected, as messages meanwhile were lost", () => {
    // Arrange
    const hub = createHub();
    const { binding, reconnect } = aliceOn(hub);
    reconnect();
    const beforeJoining = hub.sent.length;

    // Act
    binding.announce("ep-alice");
    reconnect();

    // Assert
    expect(beforeJoining).toBe(0);
    expect(hub.sent.map((s) => s.data)).toEqual([
      claim("ep-alice", 100),
      claim("ep-alice", 100),
    ]);
  });

  it("says nothing on a reconnection once stopped", () => {
    const hub = createHub();
    const { binding, reconnect } = aliceOn(hub);
    binding.announce("ep-alice");

    binding.stop();
    reconnect();

    expect(hub.sent).toHaveLength(1);
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
