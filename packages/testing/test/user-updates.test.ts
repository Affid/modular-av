// Behaviour checked against Foundry v14: common/documents/user.mjs #canUpdate,
// client/documents/user.mjs broadcastActivity.
import { describe, expect, it, vi } from "vitest";
import { createFakeWorld } from "../src/foundry/world.ts";

const USERS = [
  { id: "gm", name: "Gamemaster", role: 4 },
  { id: "as", name: "Assistant", role: 3 },
  { id: "p1", name: "Player1", role: 2 },
  { id: "p2", name: "Player2", role: 1 },
] as const;

describe("User#update in the fake world", () => {
  it("lets a GM change permissions and fires updateUser everywhere", async () => {
    // Arrange
    const world = createFakeWorld({ users: USERS });
    const gm = world.connect("gm");
    const player = world.connect("p1");
    const seen = vi.fn();
    player.Hooks.on("updateUser", seen);

    // Act
    await gm.game.users
      .get("p1")
      ?.update({ "permissions.BROADCAST_AUDIO": false });

    // Assert
    expect(player.game.user.can("BROADCAST_AUDIO")).toBe(false);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), {
      permissions: { BROADCAST_AUDIO: false },
    });
  });

  it("refuses permission changes from assistants and players", async () => {
    const world = createFakeWorld({ users: USERS });
    const assistant = world.connect("as");
    const player = world.connect("p1");

    await expect(
      assistant.game.users
        .get("p1")
        ?.update({ "permissions.BROADCAST_AUDIO": false }),
    ).rejects.toThrow(/may not update/);
    await expect(
      player.game.user.update({ "permissions.BROADCAST_VIDEO": true }),
    ).rejects.toThrow(/may not update/);
  });

  it("lets players set their own flags but not another user's", async () => {
    // Arrange
    const world = createFakeWorld({ users: USERS });
    const player = world.connect("p1");
    const other = world.connect("p2");

    // Act
    await player.game.user.setFlag("modular-av", "deafened", true);

    // Assert
    expect(other.game.users.get("p1")?.getFlag("modular-av", "deafened")).toBe(
      true,
    );
    await expect(
      other.game.users.get("p1")?.setFlag("modular-av", "deafened", false),
    ).rejects.toThrow(/may not update/);
  });

  it("keeps the same user object between reads until something changes", () => {
    const client = createFakeWorld({ users: USERS }).connect("p1");

    expect(client.game.users.get("p2")).toBe(client.game.users.get("p2"));
    expect(client.game.user.isSelf).toBe(true);
    expect(client.game.users.get("p2")?.isSelf).toBe(false);
  });

  it("refuses updates through the server-side user list", () => {
    const world = createFakeWorld({ users: USERS });

    expect(() => world.users[0]?.update({ name: "x" })).toThrow(/server-side/);
  });
});

describe("User#broadcastActivity in the fake world", () => {
  it("delivers av activity to the other clients' A/V settings", async () => {
    // Arrange
    const world = createFakeWorld({ users: USERS });
    const gm = world.connect("gm");
    const player = world.connect("p1");
    gm.runLifecycle();
    player.runLifecycle();

    // Act
    player.game.user.broadcastActivity({ av: { muted: true } });
    await world.settle();

    // Assert
    expect(gm.game.webrtc?.settings.activity.p1).toEqual(
      expect.objectContaining({ muted: true }),
    );
    expect(player.game.webrtc?.settings.activity.p1?.muted).toBeUndefined();
  });

  it("only broadcasts for the logged-in user", () => {
    const player = createFakeWorld({ users: USERS }).connect("p1");

    expect(() => {
      player.game.users.get("p2")?.broadcastActivity({ av: {} });
    }).toThrow(/your own User activity/);
  });
});
