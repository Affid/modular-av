import type { ServiceDefinition, TokenRequest } from "@modular-av/api";
import {
  createFakeWorld,
  createMockServiceHub,
  type FakeClient,
  type FakeWorld,
} from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTokenRelay,
  RATE_LIMIT,
  REPLY_TIMEOUT_MS,
  RETRY_MS,
  type TokenRelay,
} from "../src/auth/relay.ts";
import { createChannels } from "../src/socket.ts";

const USERS = [
  { id: "gm", name: "Gamemaster", role: 4 },
  { id: "gm2", name: "Gamemaster2", role: 4 },
  { id: "p1", name: "Player1", role: 2 },
  { id: "p4", name: "Player4", role: 1 },
] as const;

interface Peer {
  readonly client: FakeClient;
  readonly relay: TokenRelay;
  readonly waiting: boolean[];
  readonly signErrors: unknown[];
  readonly signed: TokenRequest[];
}

let ids = 0;

function connect(
  world: FakeWorld,
  userId: string,
  options: { secret?: boolean; failSigning?: boolean } = {},
): Peer {
  const client = world.connect(userId);
  const game = client.game;
  const hub = createMockServiceHub();
  const signed: TokenRequest[] = [];
  const service: ServiceDefinition = {
    ...hub.definition(),
    canSignTokens: () => options.secret ?? false,
    signToken: (request) => {
      signed.push(request);
      if (options.failSigning) return Promise.reject(new Error("bad secret"));
      return Promise.resolve(`token-for-${request.participant}`);
    },
  };
  const waiting: boolean[] = [];
  const signErrors: unknown[] = [];
  const relay = createTokenRelay({
    channel: createChannels(game.socket, () => undefined).channel("auth"),
    selfId: userId,
    isGM: (id) => game.users.get(id)?.isGM ?? false,
    onlineGms: () =>
      game.users.contents.filter((u) => u.active && u.isGM).map((u) => u.id),
    service: () => service,
    tokenRequestFor: (participant) => {
      const user = game.users.get(participant);
      if (!user) return null;
      return {
        participant,
        room: "room",
        canPublish: {
          audio: user.can("BROADCAST_AUDIO"),
          video: user.can("BROADCAST_VIDEO"),
        },
        ttlSeconds: 600,
      };
    },
    onWaitingForGm: (w) => waiting.push(w),
    onGmConnected: (listener) => {
      const id = client.Hooks.on("userConnected", (user: { isGM: boolean }) => {
        if (user.isGM) listener();
      });
      return () => {
        client.Hooks.off("userConnected", id);
      };
    },
    onSignError: (e) => signErrors.push(e),
    randomId: () => `req-${String(ids++)}`,
    now: () => Date.now(),
  });
  return { client, relay, waiting, signErrors, signed };
}

/** Lets socket messages and handler awaits run under fake timers. */
async function settle(world: FakeWorld): Promise<void> {
  await world.settle();
  await vi.advanceTimersByTimeAsync(0);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GM token relay", () => {
  it("gets a token from a GM for the asking user only, with their rights", async () => {
    // Arrange
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const gm = connect(world, "gm", { secret: true });
    const p4 = connect(world, "p4");

    // Act
    const token = p4.relay.request(new AbortController().signal);
    await settle(world);

    // Assert
    await expect(token).resolves.toBe("token-for-p4");
    expect(gm.signed).toEqual([
      {
        participant: "p4",
        room: "room",
        canPublish: { audio: false, video: false },
        ttlSeconds: 600,
      },
    ]);
    expect(p4.waiting).toEqual([false]);
  });

  it("lets a GM with the secret sign its own token without the socket", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = connect(world, "gm", { secret: true });

    await expect(gm.relay.request(new AbortController().signal)).resolves.toBe(
      "token-for-gm",
    );
  });

  it("is answered by any GM holding the secret", async () => {
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const gm = connect(world, "gm");
    connect(world, "gm2", { secret: true });

    const token = gm.relay.request(new AbortController().signal);
    await settle(world);

    await expect(token).resolves.toBe("token-for-gm");
  });

  it("waits for a GM to log in, then asks again at once", async () => {
    // Arrange
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const p1 = connect(world, "p1");

    // Act
    const token = p1.relay.request(new AbortController().signal);
    await settle(world);
    expect(p1.waiting).toEqual([true]);
    connect(world, "gm", { secret: true });
    await settle(world);

    // Assert
    await expect(token).resolves.toBe("token-for-p1");
    expect(p1.waiting).toEqual([true, false]);
  });

  it("waits while the online GMs can't sign, asking again every retry period", async () => {
    // Arrange
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    connect(world, "gm");
    const p1 = connect(world, "p1");
    let resolved: string | undefined;

    // Act
    void p1.relay.request(new AbortController().signal).then((t) => {
      resolved = t;
    });
    await settle(world);
    await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);

    // Assert
    expect(p1.waiting).toEqual([true]);
    connect(world, "gm2", { secret: true });
    await settle(world);
    expect(resolved).toBe("token-for-p1");
  });

  it("asks again on its own after the retry period", async () => {
    // Arrange
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const gm = connect(world, "gm");
    const p1 = connect(world, "p1");
    const requests = vi.fn();
    createChannels(gm.client.game.socket, () => undefined)
      .channel("auth")
      .on(requests);

    // Act
    void p1.relay.request(new AbortController().signal);
    await settle(world);
    await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + RETRY_MS);
    await settle(world);

    // Assert
    expect(requests).toHaveBeenCalledTimes(2);
    expect(p1.waiting).toEqual([true]);
  });

  it("ignores replies from players and malformed messages", async () => {
    // Arrange
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    connect(world, "gm");
    const p1 = connect(world, "p1");
    const attacker = world.connect("p4");
    const forged = createChannels(
      attacker.game.socket,
      () => undefined,
    ).channel("auth");
    let resolved = false;
    void p1.relay.request(new AbortController().signal).then(() => {
      resolved = true;
    });
    await settle(world);

    // Act
    forged.send({ type: "token", id: "req-0", token: "forged" });
    forged.send({ type: "token", id: "req-1", token: "forged" });
    forged.send({ type: "request" });
    forged.send({ type: "token", id: "x".repeat(65), token: "t" });
    await settle(world);

    // Assert
    expect(resolved).toBe(false);
  });

  it("rate-limits requests per user on the GM's side", async () => {
    // Arrange
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const gm = connect(world, "gm", { secret: true });
    const flood = createChannels(
      world.connect("p1").game.socket,
      () => undefined,
    ).channel("auth");

    // Act
    for (let i = 0; i < RATE_LIMIT.requests + 3; i += 1)
      flood.send({ type: "request", id: `r${String(i)}` });
    await settle(world);
    const limited = gm.signed.length;
    await vi.advanceTimersByTimeAsync(RATE_LIMIT.windowMs);
    flood.send({ type: "request", id: "later" });
    await settle(world);

    // Assert
    expect(limited).toBe(RATE_LIMIT.requests);
    expect(gm.signed).toHaveLength(RATE_LIMIT.requests + 1);
  });

  it("reports signing failures on the GM and keeps the player waiting", async () => {
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const gm = connect(world, "gm", { secret: true, failSigning: true });
    const p1 = connect(world, "p1");

    void p1.relay.request(new AbortController().signal);
    await settle(world);
    await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);

    expect(gm.signErrors).toEqual([new Error("bad secret")]);
    expect(p1.waiting).toEqual([true]);
  });

  it("does not answer as a player, or for unknown users", async () => {
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const p1 = connect(world, "p1", { secret: true });
    const gm = connect(world, "gm", { secret: true });
    const ghost = createChannels(
      world.connect("p4").game.socket,
      () => undefined,
    ).channel("auth");

    ghost.send({ type: "request", id: "g" });
    await settle(world);

    expect(p1.signed).toEqual([]);
    expect(gm.signed.map((r) => r.participant)).toEqual(["p4"]);
  });

  it("stops at once when aborted, while asking or while waiting", async () => {
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    connect(world, "gm");
    const p1 = connect(world, "p1");
    const asking = new AbortController();
    const waiting = new AbortController();

    const first = p1.relay.request(asking.signal);
    asking.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = p1.relay.request(waiting.signal);
    await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);
    waiting.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    const already = new AbortController();
    already.abort();
    await expect(p1.relay.request(already.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("stops listening once disposed", async () => {
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const gm = connect(world, "gm", { secret: true });
    const p1 = connect(world, "p1");
    gm.relay.dispose();

    void p1.relay.request(new AbortController().signal);
    await settle(world);

    expect(gm.signed).toEqual([]);
  });

  it("never signs locally on a player's device that holds a secret", async () => {
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    const p1 = connect(world, "p1", { secret: true });

    void p1.relay.request(new AbortController().signal);
    await settle(world);

    expect(p1.signed).toEqual([]);
    expect(p1.waiting).toEqual([true]);
  });

  it("asks GMs only, so other players never see request ids", async () => {
    vi.useFakeTimers();
    const world = createFakeWorld({ users: USERS });
    connect(world, "gm", { secret: true });
    const p1 = connect(world, "p1");
    const snoop = vi.fn();
    createChannels(world.connect("p4").game.socket, () => undefined)
      .channel("auth")
      .on(snoop);

    const token = p1.relay.request(new AbortController().signal);
    await settle(world);

    await expect(token).resolves.toBe("token-for-p1");
    expect(snoop).not.toHaveBeenCalled();
  });
});
