import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTable } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Another module's heartbeat on the GM's user, as a player's console showed it. */
const HEARTBEAT = {
  flags: { "sound-engine-master": { health: { timestamp: 1 } } },
  _stats: { modifiedTime: 1 },
};

async function inCall() {
  const table = createTable();
  const gm = table.join("gm", { secret: true });
  const p1 = table.join("p1");
  await table.settle();
  return { table, gm, p1 };
}

describe("another module writing on a user", () => {
  it("leaves the core's work undone", async () => {
    // Arrange
    const { table, p1 } = await inCall();
    const apply = vi.spyOn(p1.core.controller(), "apply");
    const before = p1.api.state.get();

    // Act
    table.world.updateUser("gm", HEARTBEAT);

    // Assert
    expect(apply).not.toHaveBeenCalled();
    expect(p1.api.state.get()).toBe(before);
  });

  it("still reaches the core when the core's own flags change with it", async () => {
    // Arrange
    const { table, p1 } = await inCall();

    // Act
    table.world.updateUser("gm", {
      ...HEARTBEAT,
      flags: { ...HEARTBEAT.flags, "modular-av": { deafened: true } },
    });

    // Assert
    expect(p1.api.state.get().participants.gm?.deafened).toBe(true);
  });
});

describe("the core's settings", () => {
  it("are read from Foundry once while they stay the same", async () => {
    // Arrange: in the call, every setting was read at least once.
    const { table, p1 } = await inCall();
    const get = vi.spyOn(p1.client.game.settings, "get");

    // Act: each rename recomputes everything.
    for (const name of ["Anna", "Boris", "Clara"])
      table.world.updateUser("gm", { name });
    await table.settle();

    // Assert
    const own = get.mock.calls.filter(
      ([namespace]) => namespace === "modular-av",
    );
    expect(own).toEqual([]);
    expect(p1.api.state.get().participants.gm?.name).toBe("Clara");
  });

  it("are read again once one changes", async () => {
    // Arrange
    const { table, p1 } = await inCall();
    const before = p1.api.state.get().local.gateFallback;
    const next = before === "mute" ? "send" : "mute";

    // Act
    await p1.api.commands.setGateFallback(next);
    await table.settle();

    // Assert
    expect(p1.api.state.get().local.gateFallback).toBe(next);
  });
});
