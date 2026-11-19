import { describe, expect, it } from "vitest";
import { keepAddressSafe } from "../src/saved-address.ts";

function fakeWorld(values: Record<string, unknown>, activeGM = true) {
  const writes: [string, unknown][] = [];
  let removed = 0;
  const deps = {
    settings: {
      register: () => undefined,
      get: (_namespace: string, key: string): unknown => values[key],
      set: (namespace: string, key: string, value: unknown) => {
        writes.push([`${namespace}.${key}`, value]);
        return Promise.resolve(value);
      },
    },
    isActiveGM: () => activeGM,
    randomRoom: () => "generatedroom",
    onTokenRemoved: () => {
      removed += 1;
    },
  };
  return { deps, writes, removed: () => removed };
}

describe("the address in the world settings", () => {
  it("gets a room on an open server, written by the active GM", async () => {
    const world = fakeWorld({
      access: "open",
      serverUrl: " https://meet.example.com ",
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([
      ["modular-av-jitsi.serverUrl", "https://meet.example.com/generatedroom"],
    ]);
    expect(world.removed()).toBe(0);
  });

  it("loses a token, and the GM is told", async () => {
    const world = fakeWorld({
      access: "token",
      serverUrl: "https://meet.example.com/?jwt=secret",
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([
      ["modular-av-jitsi.serverUrl", "https://meet.example.com/"],
    ]);
    expect(world.removed()).toBe(1);
  });

  it("is left alone when it is fine", async () => {
    const world = fakeWorld({
      access: "open",
      serverUrl: "https://meet.example.com/table",
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([]);
  });

  it("is written by nobody but the active GM", async () => {
    const world = fakeWorld(
      { access: "open", serverUrl: "https://meet.example.com/?jwt=x" },
      false,
    );

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([]);
    expect(world.removed()).toBe(0);
  });
});
