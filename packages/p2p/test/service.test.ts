import { FakePeerConnection } from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createP2PService, type P2PServiceDeps } from "../src/service.ts";
import { createChannelHub } from "./channels.ts";

const settings = {
  maxParticipants: () => 6,
  stunServers: () => ["stun:stun.example:3478"],
  relayOnly: () => false,
};

/** Without a factory of its own, the service uses the browser's. */
function deps(
  overrides: Partial<P2PServiceDeps> = {},
  browser = false,
): P2PServiceDeps {
  const base: P2PServiceDeps = {
    channel: createChannelHub().endpoint("alice").channel,
    settings,
    turn: () => null,
    onIceChange: () => () => undefined,
    onUserLeft: () => () => undefined,
    onReconnect: () => () => undefined,
    isUser: () => true,
    isGM: () => false,
    createPeerConnection: (configuration) =>
      new FakePeerConnection(configuration),
    now: () => 1000,
    randomId: () => "s1",
    onError: () => undefined,
    ...overrides,
  };
  if (!browser) return base;
  return Object.fromEntries(
    Object.entries(base).filter(([key]) => key !== "createPeerConnection"),
  ) as unknown as P2PServiceDeps;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the P2P service definition", () => {
  it("needs no token and leaves the media to the core", () => {
    const service = createP2PService(deps());

    expect(service).toMatchObject({
      id: "p2p",
      label: "modular-av-p2p.label",
      mediaOwnership: "core",
    });
    expect(service.needsToken()).toBe(false);
    expect("signToken" in service).toBe(false);
  });

  it("creates its connection lazily, with no link before joining", async () => {
    // Arrange
    const created: RTCConfiguration[] = [];
    const service = createP2PService(
      deps({
        createPeerConnection: (configuration) => {
          created.push(configuration);
          return new FakePeerConnection(configuration);
        },
      }),
    );

    // Act
    const connection = await service.create({ participant: "alice" });

    // Assert
    expect(connection.capabilities.get().moderation).toBe(false);
    expect(created).toEqual([]);
  });

  it("ends plainly in a browser without WebRTC", async () => {
    vi.stubGlobal("RTCPeerConnection", undefined);
    const service = createP2PService(deps({}, true));

    await expect(
      service.create({ participant: "alice" }),
    ).rejects.toMatchObject({
      serviceError: { code: "unsupported", final: true },
    });
  });

  it("uses the browser's RTCPeerConnection by default", async () => {
    vi.useFakeTimers();
    const made: unknown[] = [];
    vi.stubGlobal(
      "RTCPeerConnection",
      class extends FakePeerConnection {
        constructor(configuration: RTCConfiguration) {
          super(configuration);
          made.push(configuration);
        }
      },
    );
    const hub = createChannelHub();
    const make = (user: string) => {
      const own = deps(
        { channel: hub.endpoint(user).channel, randomId: () => `s-${user}` },
        true,
      );
      return createP2PService(own).create({ participant: user });
    };
    const [alice, bob] = await Promise.all([make("alice"), make("bob")]);

    const joining = Promise.all(
      [alice, bob].map((c) =>
        c.connect({ name: "w" }, null, new AbortController().signal),
      ),
    );
    await vi.advanceTimersByTimeAsync(2000);
    await joining;
    vi.useRealTimers();

    expect(made).toContainEqual({
      iceServers: [{ urls: ["stun:stun.example:3478"] }],
      iceTransportPolicy: "all",
    });
  });
});
