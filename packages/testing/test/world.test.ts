import { describe, expect, it, vi } from "vitest";
import type { FakeUser } from "../src/foundry/users.ts";
import { createFakeWorld } from "../src/foundry/world.ts";

const USERS = [
  { id: "gm1", name: "Gamemaster", role: 4 },
  { id: "gm2", name: "Gamemaster2", role: 4 },
  { id: "p1", name: "Player1", role: 1 },
  { id: "p2", name: "Player2", role: 2 },
] as const;

describe("fake world and clients", () => {
  it("exposes the current user and the user list", () => {
    // Arrange
    const world = createFakeWorld({ users: USERS });

    // Act
    const client = world.connect("p1");

    // Assert
    expect(client.game.user.name).toBe("Player1");
    expect(client.game.user.isGM).toBe(false);
    expect(client.game.users.getName("Gamemaster")?.isGM).toBe(true);
    expect(client.game.users.contents).toHaveLength(4);
  });

  it("refuses to connect a user that does not exist", () => {
    expect(() => createFakeWorld({ users: USERS }).connect("nobody")).toThrow(
      /unknown user/,
    );
  });

  it("marks users active while connected and picks the active GM", () => {
    const world = createFakeWorld({ users: USERS });
    const player = world.connect("p1");
    expect(player.game.users.activeGM).toBeNull();

    const gm2 = world.connect("gm2");
    world.connect("gm1");

    expect(player.game.users.activeGM?.id).toBe("gm1");
    expect(player.game.users.get("gm2")?.active).toBe(true);
    gm2.disconnect();
    expect(player.game.users.get("gm2")?.active).toBe(false);
  });

  it("fires userConnected on the other clients", () => {
    const world = createFakeWorld({ users: USERS });
    const player = world.connect("p1");
    const seen = vi.fn<(user: FakeUser, connected: boolean) => void>();
    player.Hooks.on("userConnected", seen);

    const gm = world.connect("gm1");
    gm.disconnect();

    expect(seen.mock.calls.map(([user, on]) => [user.id, on])).toEqual([
      ["gm1", true],
      ["gm1", false],
    ]);
  });

  it("grants broadcast permissions by role unless overridden", () => {
    const world = createFakeWorld({
      users: [
        ...USERS,
        {
          id: "p3",
          name: "Player3",
          role: 2,
          permissions: { BROADCAST_VIDEO: false },
        },
      ],
    });
    const users = world.connect("gm1").game.users;

    expect(users.get("p1")?.hasPermission("BROADCAST_AUDIO")).toBe(false);
    expect(users.get("p2")?.hasPermission("BROADCAST_AUDIO")).toBe(true);
    expect(users.get("p3")?.hasPermission("BROADCAST_AUDIO")).toBe(true);
    expect(users.get("p3")?.hasPermission("BROADCAST_VIDEO")).toBe(false);
  });

  it("updates a user immutably and fires updateUser everywhere", () => {
    const world = createFakeWorld({ users: USERS });
    const player = world.connect("p2");
    const before = player.game.users.get("p2");
    const seen = vi.fn();
    player.Hooks.on("updateUser", seen);

    world.updateUser("p2", { permissions: { BROADCAST_AUDIO: false } });

    const after = player.game.users.get("p2");
    expect(before?.hasPermission("BROADCAST_AUDIO")).toBe(true);
    expect(after?.hasPermission("BROADCAST_AUDIO")).toBe(false);
    expect(seen).toHaveBeenCalledWith(after, {
      permissions: { BROADCAST_AUDIO: false },
    });
  });

  it("delivers socket messages to the other clients with the sender id", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = world.connect("gm1");
    const player = world.connect("p1");
    const gmReceived = vi.fn();
    const playerReceived = vi.fn();
    gm.game.socket.on("module.modular-av", gmReceived);
    player.game.socket.on("module.modular-av", playerReceived);

    player.game.socket.emit("module.modular-av", { type: "token" });
    await world.settle();

    expect(gmReceived).toHaveBeenCalledWith({ type: "token" }, "p1");
    expect(playerReceived).not.toHaveBeenCalled();
  });

  it("stops delivering to a client after off() or disconnect()", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = world.connect("gm1");
    const gm2 = world.connect("gm2");
    const player = world.connect("p1");
    const handler = vi.fn();
    const handler2 = vi.fn();
    gm.game.socket.on("module.x", handler);
    gm2.game.socket.on("module.x", handler2);

    gm.game.socket.off("module.x", handler);
    gm2.disconnect();
    player.game.socket.emit("module.x", 1);
    await world.settle();

    expect(handler).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it("runs init, setup and ready in order and sets game.ready", () => {
    const client = createFakeWorld({ users: USERS }).connect("p1");
    const order: string[] = [];
    for (const hook of ["init", "setup", "ready"]) {
      client.Hooks.on(hook, () =>
        order.push(`${hook}:${String(client.game.ready)}`),
      );
    }

    client.runLifecycle();

    expect(order).toEqual(["init:false", "setup:false", "ready:true"]);
  });

  it("lists modules and lets a module expose an api", () => {
    const client = createFakeWorld({
      users: USERS,
      modules: [{ id: "modular-av", version: "0.1.0" }],
    }).connect("p1");

    const mod = client.game.modules.get("modular-av");
    if (mod) mod.api = { ok: true };

    expect(mod?.active).toBe(true);
    expect(client.game.modules.get("modular-av")?.api).toEqual({ ok: true });
  });

  it("localizes from nested translations and falls back to the key", () => {
    const client = createFakeWorld({
      users: USERS,
      translations: { "modular-av": { hello: "Hello {name}" } },
    }).connect("p1");

    expect(client.game.i18n.localize("modular-av.hello")).toBe("Hello {name}");
    expect(client.game.i18n.format("modular-av.hello", { name: "Ann" })).toBe(
      "Hello Ann",
    );
    expect(client.game.i18n.has("modular-av.nope")).toBe(false);
    expect(client.game.i18n.localize("modular-av.nope")).toBe(
      "modular-av.nope",
    );
  });

  it("records notifications", () => {
    const client = createFakeWorld({ users: USERS }).connect("p1");

    client.ui.notifications.warn("Waiting for the GM");

    expect(client.notifications).toEqual([
      { type: "warn", message: "Waiting for the GM" },
    ]);
  });

  it("installs its globals and restores the previous ones", () => {
    const client = createFakeWorld({ users: USERS }).connect("p1");
    const target: Record<string, unknown> = { game: "old" };

    const uninstall = client.install(target);
    expect(target.game).toBe(client.game);
    expect(target.Hooks).toBe(client.Hooks);
    uninstall();

    expect(target).toEqual({ game: "old" });
  });

  it("holds the world's A/V settings as core.rtcWorldSettings, which only a GM sets", async () => {
    // Arrange
    const world = createFakeWorld({ users: USERS, av: { mode: 3 } });
    const gm = world.connect("gm1");
    const player = world.connect("p1");
    gm.runLifecycle();
    player.runLifecycle();
    const was = gm.game.settings.get("core", "rtcWorldSettings") as object;

    // Act
    await gm.game.settings.set("core", "rtcWorldSettings", { ...was, mode: 1 });

    // Assert
    expect(player.game.settings.get("core", "rtcWorldSettings")).toMatchObject({
      mode: 1,
      turn: { type: "server" },
    });
    expect(player.game.webrtc?.settings.world.mode).toBe(1);
    await expect(
      player.game.settings.set("core", "rtcWorldSettings", { ...was, mode: 0 }),
    ).rejects.toThrow(/may not modify/);
  });
});
