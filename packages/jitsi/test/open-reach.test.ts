import { beforeEach, describe, expect, it } from "vitest";
import { createJitsiConnection } from "../src/connection.ts";
import type { JitsiServer } from "../src/join.ts";
import { createHub } from "./fake-channel.ts";
import { createFakeSdk, type FakeSdk } from "./fake-sdk.ts";
import { installMediaStream } from "./media-stream.ts";

const DOCKER = { domain: "meet.jitsi", muc: "muc.meet.jitsi" };

/** A server per test: which names worked is kept per WebSocket. */
const openServer = (host: string): JitsiServer => ({
  serviceUrl: `wss://${host}/xmpp-websocket?room=ourtable`,
  domain: host,
  muc: `conference.${host}`,
  open: { room: "ourtable", fallback: DOCKER },
});

/** Only Docker's names open a connection, as on a docker-jitsi-meet. */
const dockerOnly = (sdk: FakeSdk): void => {
  sdk.setup = (c) => {
    if (c.options.hosts.domain !== DOCKER.domain)
      c.outcome = "connection.otherError";
  };
};

function connect(
  sdk: FakeSdk,
  server: JitsiServer,
  signal = new AbortController().signal,
  token: string | null = null,
): Promise<void> {
  return createJitsiConnection(
    { participant: "alice" },
    {
      sdk,
      server,
      now: () => 0,
      onError: () => undefined,
      openRoom: {
        channel: createHub().channel("alice"),
        joinedAt: 1,
        onOutsider: () => undefined,
      },
    },
  ).connect({ name: "World-1" }, token, signal);
}

const domainsTried = (sdk: FakeSdk): string[] =>
  sdk.connections.map((c) => c.options.hosts.domain);

beforeEach(() => {
  installMediaStream();
});

describe("reaching an open server", () => {
  it("tries Docker's names when the link's host isn't the XMPP domain, and starts with them next time", async () => {
    // Arrange
    const server = openServer("docker.example.com");
    const first = createFakeSdk();
    const next = createFakeSdk();
    dockerOnly(first);
    dockerOnly(next);

    // Act
    await connect(first, server);
    await connect(next, server);

    // Assert
    expect(domainsTried(first)).toEqual(["docker.example.com", "meet.jitsi"]);
    expect(first.connections[1]?.options.hosts).toEqual(DOCKER);
    expect(domainsTried(next)).toEqual(["meet.jitsi"]);
  });

  it("fails the attempt, for a retry, when neither names work", async () => {
    const sdk = createFakeSdk();
    sdk.setup = (c) => {
      c.outcome = "connection.otherError";
    };

    await expect(
      connect(sdk, openServer("down.example.com")),
    ).rejects.toMatchObject({
      serviceError: { code: "network", final: false },
    });
    expect(domainsTried(sdk)).toEqual(["down.example.com", "meet.jitsi"]);
  });

  it("tries nothing else when the link's own host asks for a sign-in", async () => {
    const sdk = createFakeSdk();
    sdk.setup = (c) => {
      c.outcome =
        c.options.hosts.domain === DOCKER.domain
          ? "connection.otherError"
          : "connection.passwordRequired";
    };

    await expect(
      connect(sdk, openServer("signin.example.com")),
    ).rejects.toMatchObject({
      serviceError: { code: "auth", final: true, message: /sign-in/ },
    });
    expect(domainsTried(sdk)).toEqual(["signin.example.com"]);
  });

  it("says a sign-in is asked for when Docker's names ask for one", async () => {
    const sdk = createFakeSdk();
    sdk.setup = (c) => {
      c.outcome =
        c.options.hosts.domain === DOCKER.domain
          ? "connection.passwordRequired"
          : "connection.otherError";
    };

    await expect(
      connect(sdk, openServer("docker-signin.example.com")),
    ).rejects.toMatchObject({
      serviceError: { code: "auth", final: true, message: /sign-in/ },
    });
    expect(domainsTried(sdk)).toEqual([
      "docker-signin.example.com",
      "meet.jitsi",
    ]);
  });

  it("tries nothing else once the attempt is aborted", async () => {
    const sdk = createFakeSdk();
    dockerOnly(sdk);
    const aborted = new AbortController();
    aborted.abort();

    await expect(
      connect(sdk, openServer("gone.example.com"), aborted.signal),
    ).rejects.toThrow(/aborted/);
    expect(sdk.connections).toHaveLength(1);
  });

  it("tries only the names given when there is no fallback", async () => {
    const sdk = createFakeSdk();
    dockerOnly(sdk);
    const server = openServer("plain.example.com");
    const given: JitsiServer = { ...server, open: { room: "ourtable" } };

    await expect(connect(sdk, given)).rejects.toMatchObject({
      serviceError: { code: "network" },
    });
    expect(domainsTried(sdk)).toEqual(["plain.example.com"]);
  });
});
