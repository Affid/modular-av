// Behaviour checked against Foundry v14's own code (paths in each test name).
import { describe, expect, it, vi } from "vitest";
import { createFakeWorld } from "../src/foundry/world.ts";

const USERS = [
  { id: "a-assistant", name: "Assistant", role: 3 },
  { id: "z-gm", name: "Gamemaster", role: 4 },
  { id: "y-gm", name: "Gamemaster2", role: 4 },
  { id: "p1", name: "Player1", role: 1 },
  { id: "p2", name: "Player2", role: 2 },
  {
    id: "banned",
    name: "Banned",
    role: 0,
    permissions: { BROADCAST_AUDIO: true },
  },
] as const;

function readyClient(
  userId: string,
  world = createFakeWorld({ users: USERS }),
) {
  const client = world.connect(userId);
  client.runLifecycle();
  return client;
}

describe("activeGM (client/documents/collections/users.mjs getDesignatedUser)", () => {
  it("prefers the highest role, then the lowest id, and is null when none", () => {
    // Arrange
    const world = createFakeWorld({ users: USERS });
    const player = world.connect("p1");
    expect(player.game.users.activeGM).toBeNull();

    // Act
    world.connect("a-assistant");
    world.connect("z-gm");
    world.connect("y-gm");

    // Assert
    expect(player.game.users.activeGM?.id).toBe("y-gm");
  });
});

describe("hasPermission (common/documents/user.mjs)", () => {
  it("gives required roles the permission whatever the override says", () => {
    const users = createFakeWorld({
      users: [
        {
          id: "gm",
          name: "GM",
          role: 4,
          permissions: { SETTINGS_MODIFY: false },
        },
        {
          id: "as",
          name: "AS",
          role: 3,
          permissions: { SETTINGS_MODIFY: false },
        },
      ],
    }).connect("gm").game.users;

    expect(users.get("gm")?.hasPermission("SETTINGS_MODIFY")).toBe(true);
    expect(users.get("as")?.hasPermission("SETTINGS_MODIFY")).toBe(false);
  });

  it("denies everything to banned users and throws for unknown permissions", () => {
    const users = createFakeWorld({ users: USERS }).connect("p1").game.users;

    expect(users.get("banned")?.hasPermission("BROADCAST_AUDIO")).toBe(false);
    expect(() => users.get("p1")?.hasPermission("NOT_A_PERMISSION")).toThrow(
      /permission/,
    );
  });
});

describe("settings (client/helpers/client-settings.mjs, client/documents/setting.mjs)", () => {
  it("calls onChange only when the stored value changes", async () => {
    const client = readyClient("z-gm");
    const onChange = vi.fn();
    for (const scope of ["world", "user", "client"] as const) {
      client.game.settings.register("mod", scope, {
        scope,
        default: { a: 1 },
        onChange,
      });
    }

    for (const scope of ["world", "user", "client"] as const) {
      await client.game.settings.set("mod", scope, { a: 2 });
      await client.game.settings.set("mod", scope, { a: 2 });
    }

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("passes the writer's user id to onChange for world settings", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = readyClient("z-gm", world);
    const player = readyClient("p1", world);
    const onChange = vi.fn();
    for (const client of [gm, player]) {
      client.game.settings.register("mod", "room", {
        scope: "world",
        default: "",
        onChange,
      });
    }

    await gm.game.settings.set("mod", "room", "tavern");

    expect(onChange).toHaveBeenCalledWith("tavern", {}, "z-gm");
  });

  it("stores values as JSON", async () => {
    const client = readyClient("z-gm");
    client.game.settings.register("mod", "v", {
      scope: "client",
      default: null,
    });

    await client.game.settings.set("mod", "v", {
      when: new Date(0),
      skip: undefined,
    });

    expect(client.game.settings.get("mod", "v")).toEqual({
      when: "1970-01-01T00:00:00.000Z",
    });
  });

  it("refuses world and user settings before the game is ready", async () => {
    const client = createFakeWorld({ users: USERS }).connect("z-gm");
    client.game.settings.register("mod", "w", { scope: "world", default: 0 });
    client.game.settings.register("mod", "c", { scope: "client", default: 0 });

    await expect(client.game.settings.set("mod", "w", 1)).rejects.toThrow(
      /before the Game is ready/,
    );
    await expect(client.game.settings.set("mod", "c", 1)).resolves.toBe(1);
  });

  it("keeps notifying other clients when one onChange throws", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = readyClient("z-gm", world);
    const player = readyClient("p1", world);
    const seen = vi.fn();
    gm.game.settings.register("mod", "x", {
      scope: "world",
      default: 0,
      onChange: () => {
        throw new Error("render failed");
      },
    });
    player.game.settings.register("mod", "x", {
      scope: "world",
      default: 0,
      onChange: seen,
    });

    await gm.game.settings.set("mod", "x", 1);

    expect(seen).toHaveBeenCalledWith(1, {}, "z-gm");
    expect(world.errors).toHaveLength(1);
  });
});

describe("socket (dist/server/sockets.mjs handleCustomSocket)", () => {
  it("delivers only to the recipients' clients when recipients are given", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = readyClient("z-gm", world);
    const p1 = readyClient("p1", world);
    const p2 = readyClient("p2", world);
    const [gmSeen, p1Seen, p2Seen] = [vi.fn(), vi.fn(), vi.fn()];
    gm.game.socket.on("module.x", gmSeen);
    p1.game.socket.on("module.x", p1Seen);
    p2.game.socket.on("module.x", p2Seen);

    gm.game.socket.emit("module.x", "token", { recipients: ["p1"] });
    await world.settle();

    expect(p1Seen).toHaveBeenCalledWith("token", "z-gm");
    expect(p2Seen).not.toHaveBeenCalled();
    expect(gmSeen).not.toHaveBeenCalled();
  });

  it("settles replies sent after awaits in a handler", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = readyClient("z-gm", world);
    const player = readyClient("p1", world);
    const reply = vi.fn();
    gm.game.socket.on("module.x", async (_data, senderId) => {
      await Promise.resolve();
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
      gm.game.socket.emit("module.x-reply", "token", {
        recipients: [senderId],
      });
    });
    player.game.socket.on("module.x-reply", reply);

    player.game.socket.emit("module.x", "request");
    await world.settle();

    expect(reply).toHaveBeenCalledWith("token", "z-gm");
  });

  it("refuses to emit from a disconnected client", () => {
    const client = readyClient("p1");
    client.disconnect();

    expect(() => {
      client.game.socket.emit("module.x", 1);
    }).toThrow(/disconnected/);
  });
});
