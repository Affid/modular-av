import type { Stats } from "@modular-av/api";
import { describe, expect, it } from "vitest";
import { lazyStats } from "../src/session/lazy-stats.ts";

describe("connection details loaded on first use", () => {
  it("load once, and try again after a failed load", async () => {
    // Arrange
    let loads = 0;
    const loaded: Stats = { get: () => Promise.resolve({ roundTripMs: 12 }) };
    const stats = lazyStats(() => {
      loads += 1;
      return loads === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(loaded);
    });

    // Act and assert
    await expect(stats.get(null)).rejects.toThrow("offline");
    expect(await stats.get(null)).toEqual({ roundTripMs: 12 });
    await stats.get("p1");
    expect(loads).toBe(2);
  });
});
