import { createFakeWorld } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import { assetUrl, createChannels, SOCKET_EVENT } from "../src/socket.ts";

const USERS = [
  { id: "gm", name: "Gamemaster", role: 4 },
  { id: "p1", name: "Player1", role: 2 },
  { id: "p2", name: "Player2", role: 2 },
] as const;

function setup() {
  const world = createFakeWorld({ users: USERS });
  const errors: unknown[] = [];
  const onError = (e: unknown): void => {
    errors.push(e);
  };
  const clients = USERS.map((u) => world.connect(u.id));
  const channels = clients.map((c) => createChannels(c.game.socket, onError));
  return { world, clients, channels, errors };
}

describe("socket channels", () => {
  it("delivers data on the same channel only, with the sender", async () => {
    // Arrange
    const { world, channels } = setup();
    const [gm, p1] = channels;
    const onAuth = vi.fn();
    const onOther = vi.fn();
    gm?.channel("auth").on(onAuth);
    gm?.channel("other").on(onOther);

    // Act
    p1?.channel("auth").send({ hello: 1 });
    await world.settle();

    // Assert
    expect(onAuth).toHaveBeenCalledWith({ hello: 1 }, "p1");
    expect(onOther).not.toHaveBeenCalled();
  });

  it("sends only to recipients when given", async () => {
    const { world, channels } = setup();
    const [gm, p1, p2] = channels;
    const toP1 = vi.fn();
    const toP2 = vi.fn();
    p1?.channel("auth").on(toP1);
    p2?.channel("auth").on(toP2);

    gm?.channel("auth").send("token", { recipients: ["p1"] });
    await world.settle();

    expect(toP1).toHaveBeenCalledWith("token", "gm");
    expect(toP2).not.toHaveBeenCalled();
  });

  it("ignores malformed messages and isolates throwing handlers", async () => {
    // Arrange
    const { world, clients, channels, errors } = setup();
    const kept = vi.fn();
    channels[0]?.channel("auth").on(() => {
      throw new Error("boom");
    });
    channels[0]?.channel("auth").on(kept);
    const off = channels[0]?.channel("auth").on(kept);
    off?.();

    // Act
    clients[1]?.game.socket.emit(SOCKET_EVENT, "not an envelope");
    clients[1]?.game.socket.emit(SOCKET_EVENT, { channel: 1, data: 1 });
    channels[1]?.channel("auth").send(1);
    await world.settle();

    // Assert
    expect(kept).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([new Error("boom")]);
  });

  it("rejects channel names that are not simple identifiers", () => {
    const { channels } = setup();

    expect(() => channels[0]?.channel("")).toThrow(/Invalid socket channel/);
    expect(() => channels[0]?.channel("Has Spaces")).toThrow(
      /Invalid socket channel/,
    );
  });
});

describe("assetUrl", () => {
  const route = (path: string): string => `/prefix/${path}`;

  it("resolves through Foundry's route", () => {
    expect(assetUrl(route, "modular-av", "worklets/gate.js")).toBe(
      "/prefix/modules/modular-av/worklets/gate.js",
    );
  });

  it("refuses paths that leave the module folder", () => {
    for (const path of ["../x.js", "a/../../b", "/etc/passwd", "a//b", ""])
      expect(() => assetUrl(route, "modular-av", path)).toThrow(
        /Invalid module asset/,
      );
    expect(() => assetUrl(route, "../core", "a.js")).toThrow(
      /Invalid module asset/,
    );
  });
});
