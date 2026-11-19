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

/** The address as the active GM last left it, kept in the world. */
const settled = (open: boolean, address: string) => ({
  settledAddress: { open, address },
});

describe("the address in the world settings", () => {
  it("gets a room on an open server, written by the active GM", async () => {
    const world = fakeWorld({
      access: "open",
      serverUrl: " https://meet.example.com ",
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([
      ["modular-av-jitsi.serverUrl", "https://meet.example.com/generatedroom"],
      [
        "modular-av-jitsi.settledAddress",
        { open: true, address: "https://meet.example.com/generatedroom" },
      ],
    ]);
    expect(world.removed()).toBe(0);
  });

  it("loses a token, and the GM is told", async () => {
    const world = fakeWorld({
      access: "token",
      serverUrl: "https://meet.example.com/?jwt=secret",
      ...settled(false, "https://meet.example.com/"),
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([
      ["modular-av-jitsi.serverUrl", "https://meet.example.com/"],
    ]);
    expect(world.removed()).toBe(1);
  });

  it("is left alone when it is fine and settled", async () => {
    const world = fakeWorld({
      access: "open",
      serverUrl: "https://meet.example.com/table",
      ...settled(true, "https://meet.example.com/table"),
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([]);
  });

  it("goes back to the server's address when tokens are chosen again, after a reload too", async () => {
    // Arrange: the open room is no site path, as tokens would read it.
    // What was settled lives in the world, not in a page a reload clears.
    const link =
      "https://example.com/jitsi/ourtable#config.startWithAudioMuted=true";
    const world = fakeWorld({
      access: "token",
      serverUrl: link,
      ...settled(true, link),
    });

    // Act
    await keepAddressSafe(world.deps);

    // Assert
    expect(world.writes).toEqual([
      ["modular-av-jitsi.serverUrl", "https://example.com/jitsi"],
      [
        "modular-av-jitsi.settledAddress",
        { open: false, address: "https://example.com/jitsi" },
      ],
    ]);
  });

  it("keeps an address saved along with the switch to tokens", async () => {
    const world = fakeWorld({
      access: "token",
      serverUrl: "https://example.com/jitsi",
      ...settled(true, "https://meet.example.com/table"),
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([
      [
        "modular-av-jitsi.settledAddress",
        { open: false, address: "https://example.com/jitsi" },
      ],
    ]);
  });

  it("keeps a site's own path when tokens were chosen all along", async () => {
    const world = fakeWorld({
      access: "token",
      serverUrl: "https://example.com/jitsi",
      ...settled(false, "https://example.com/jitsi"),
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([]);
  });

  it.each([
    ["nothing settled yet", undefined],
    ["something else", "https://example.com/jitsi/ourtable"],
    ["a strange shape", { open: "yes", address: 1 }],
  ])("takes %s for no earlier choice: nothing comes off", async (_, value) => {
    const world = fakeWorld({
      access: "token",
      serverUrl: "https://example.com/jitsi/ourtable",
      settledAddress: value,
    });

    await keepAddressSafe(world.deps);

    expect(world.writes).toEqual([
      [
        "modular-av-jitsi.settledAddress",
        { open: false, address: "https://example.com/jitsi/ourtable" },
      ],
    ]);
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
