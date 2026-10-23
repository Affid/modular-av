import { describe, expect, it } from "vitest";
import {
  expandObject,
  flattenKeys,
  getProperty,
  mergeObject,
  setProperty,
} from "../src/foundry/objects.ts";

describe("object helpers", () => {
  it("expands dotted keys into nested objects", () => {
    expect(
      expandObject({ "permissions.BROADCAST_AUDIO": false, "a.b.c": 1, d: 2 }),
    ).toEqual({
      permissions: { BROADCAST_AUDIO: false },
      a: { b: { c: 1 } },
      d: 2,
    });
  });

  it("sets a nested value without touching the original", () => {
    // Arrange
    const tree = { users: { p1: { muted: false, volume: 1 } } };

    // Act
    const next = setProperty(tree, "users.p1.muted", true);

    // Assert
    expect(next).toEqual({ users: { p1: { muted: true, volume: 1 } } });
    expect(tree.users.p1.muted).toBe(false);
  });

  it("replaces a non-object on the way and rejects an empty path", () => {
    expect(setProperty({ a: 1 }, "a.b", 2)).toEqual({ a: { b: 2 } });
    expect(() => setProperty({}, "", 1)).toThrow(/Empty path/);
  });

  it("reads dotted paths and returns undefined for missing ones", () => {
    expect(getProperty({ a: { b: 3 } }, "a.b")).toBe(3);
    expect(getProperty({ a: 1 }, "a.b")).toBeUndefined();
  });

  it("merges deeply with the second object winning", () => {
    expect(
      mergeObject({ a: { b: 1, c: 2 }, d: 1 }, { a: { c: 3 }, d: { e: 1 } }),
    ).toEqual({ a: { b: 1, c: 3 }, d: { e: 1 } });
  });

  it("lists leaf paths like flattenObject's keys", () => {
    expect(flattenKeys({ world: { turn: { url: "x" } }, a: {}, b: 1 })).toEqual(
      ["world.turn.url", "a", "b"],
    );
  });
});
