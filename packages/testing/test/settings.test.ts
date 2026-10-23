import { describe, expect, it, vi } from "vitest";
import { createFakeWorld } from "../src/foundry/world.ts";

const USERS = [
  { id: "gm1", name: "Gamemaster", role: 4 },
  { id: "p1", name: "Player1", role: 1 },
] as const;

describe("fake settings", () => {
  it("returns a copy of the default until a value is set", () => {
    // Arrange
    const client = createFakeWorld({ users: USERS }).connect("p1");
    client.game.settings.register("mod", "list", {
      scope: "client",
      default: [1],
    });

    // Act
    const first = client.game.settings.get("mod", "list") as number[];
    first.push(2);

    // Assert
    expect(client.game.settings.get("mod", "list")).toEqual([1]);
  });

  it("throws for a setting that was never registered", () => {
    const client = createFakeWorld({ users: USERS }).connect("p1");

    expect(() => client.game.settings.get("mod", "missing")).toThrow(
      /not a registered game setting/,
    );
  });

  it("shares world settings with every client and calls onChange on each", async () => {
    const world = createFakeWorld({ users: USERS });
    const gm = world.connect("gm1");
    const player = world.connect("p1");
    const onChange = vi.fn();
    for (const client of [gm, player]) {
      client.game.settings.register("mod", "room", {
        scope: "world",
        default: "",
        onChange,
      });
    }

    await gm.game.settings.set("mod", "room", "tavern");

    expect(player.game.settings.get("mod", "room")).toBe("tavern");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith("tavern");
  });

  it("refuses world setting changes from players", async () => {
    const player = createFakeWorld({ users: USERS }).connect("p1");
    player.game.settings.register("mod", "room", {
      scope: "world",
      default: "",
    });

    await expect(player.game.settings.set("mod", "room", "x")).rejects.toThrow(
      /permission/,
    );
  });

  it("keeps client settings on one client only", async () => {
    const world = createFakeWorld({ users: USERS });
    const tabA = world.connect("gm1");
    const tabB = world.connect("gm1");
    for (const client of [tabA, tabB]) {
      client.game.settings.register("mod", "secret", {
        scope: "client",
        default: "",
      });
    }

    await tabA.game.settings.set("mod", "secret", "s3cret");

    expect(tabA.game.settings.get("mod", "secret")).toBe("s3cret");
    expect(tabB.game.settings.get("mod", "secret")).toBe("");
  });

  it("follows the user across clients for user settings", async () => {
    const world = createFakeWorld({ users: USERS });
    const tabA = world.connect("p1");
    const tabB = world.connect("p1");
    const other = world.connect("gm1");
    for (const client of [tabA, tabB, other]) {
      client.game.settings.register("mod", "theme", {
        scope: "user",
        default: "plain",
      });
    }

    await tabA.game.settings.set("mod", "theme", "vines");

    expect(tabB.game.settings.get("mod", "theme")).toBe("vines");
    expect(other.game.settings.get("mod", "theme")).toBe("plain");
  });

  it("rejects an unknown scope at registration", () => {
    const client = createFakeWorld({ users: USERS }).connect("p1");

    expect(() => {
      client.game.settings.register("mod", "bad", {
        scope: "server" as "world",
        default: 0,
      });
    }).toThrow(/scope/);
  });
});
