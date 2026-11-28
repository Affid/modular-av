import { describe, expect, it } from "vitest";
import { affectsCore } from "../src/foundry/user-changes.ts";

describe("which user updates matter to the core", () => {
  it("ignores another module's flags and Foundry's own bookkeeping", () => {
    // Arrange: a module's heartbeat, as a player's console showed it.
    const changes = {
      flags: { "sound-engine-master": { health: { timestamp: 1 } } },
      _stats: { modifiedTime: 1 },
      _id: "gm",
    };

    // Act
    const affects = affectsCore(changes);

    // Assert
    expect(affects).toBe(false);
  });

  it.each([
    ["name", { name: "Renamed" }],
    ["color", { color: "#ff0000" }],
    ["avatar", { avatar: "icons/a.webp" }],
    ["role", { role: 4 }],
    ["permissions", { permissions: { BROADCAST_VIDEO: false } }],
    ["presence", { active: false }],
  ])("follows a change of the user's %s", (_field, changes) => {
    expect(affectsCore({ _id: "p1", ...changes })).toBe(true);
  });

  it("follows the core's own flags, set or removed", () => {
    expect(affectsCore({ flags: { "modular-av": { deafened: true } } })).toBe(
      true,
    );
    expect(affectsCore({ flags: { "modular-av": { deafened: {} } } })).toBe(
      true,
    );
    expect(affectsCore({ flags: { "-=modular-av": null } })).toBe(true);
  });

  it("follows another module's flags when the core's change with them", () => {
    const changes = {
      flags: { "sound-engine-master": { a: 1 }, "modular-av": { b: 2 } },
    };

    expect(affectsCore(changes)).toBe(true);
  });

  it("follows an update it cannot read", () => {
    expect(affectsCore(undefined)).toBe(true);
    expect(affectsCore("name")).toBe(true);
  });
});
