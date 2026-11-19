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

  it("goes back to the server's address when tokens are chosen again", async () => {
    // Arrange: the open room is no site path, as tokens would read it.
    const world = fakeWorld({
      access: "token",
      serverUrl:
        "https://example.com/jitsi/ourtable#config.startWithAudioMuted=true",
    });
    const before = {
      open: true,
      address:
        "https://example.com/jitsi/ourtable#config.startWithAudioMuted=true",
    };

    // Act
    await keepAddressSafe(world.deps, before);

    // Assert
    expect(world.writes).toEqual([
      ["modular-av-jitsi.serverUrl", "https://example.com/jitsi"],
    ]);
  });

  it("keeps an address saved along with the switch to tokens", async () => {
    const world = fakeWorld({
      access: "token",
      serverUrl: "https://example.com/jitsi",
    });
    const before = { open: true, address: "https://meet.example.com/table" };

    await keepAddressSafe(world.deps, before);

    expect(world.writes).toEqual([]);
  });

  it("keeps a site's own path when tokens were chosen all along", async () => {
    const world = fakeWorld({
      access: "token",
      serverUrl: "https://example.com/jitsi",
    });
    const before = { open: false, address: "https://example.com/jitsi" };

    await keepAddressSafe(world.deps, before);

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
