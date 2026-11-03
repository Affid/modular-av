import { describe, expect, it, vi } from "vitest";
import { foundryPresetStore } from "../src/presets/foundry-store.ts";
import { registerPresetKeys } from "../src/presets/keys.ts";
import { macroApi } from "../src/presets/macro.ts";

function fakeFoundry() {
  const flags = new Map<string, unknown>();
  const settings = new Map<string, unknown>([["activePreset", ""]]);
  const user = {
    getFlag: (_scope: string, key: string) => flags.get(key),
    setFlag: vi.fn((_scope: string, key: string, value: unknown) => {
      const [, id] = key.split(".");
      flags.set("presets", {
        ...(flags.get("presets") as object | undefined),
        [id ?? ""]: value,
      });
      return Promise.resolve(user);
    }),
    unsetFlag: vi.fn((_scope: string, key: string) => {
      const [, id] = key.split(".");
      flags.set(
        "presets",
        Object.fromEntries(
          Object.entries(flags.get("presets") as object).filter(
            ([saved]) => saved !== id,
          ),
        ),
      );
      return Promise.resolve(user);
    }),
  };
  return { user, settings };
}

describe("presets in Foundry", () => {
  it("keeps one flag key per preset on the player's own User", async () => {
    // Arrange
    const { user, settings } = fakeFoundry();
    const store = foundryPresetStore({
      user: () => user,
      getSetting: (key) => settings.get(key),
      setSetting: (key, value) => {
        settings.set(key, value);
        return Promise.resolve();
      },
      onUserChange: () => () => undefined,
    });

    // Act
    await store.write("abc", "{}");

    // Assert
    expect(user.setFlag).toHaveBeenCalledWith(
      "modular-av-audio-mixer",
      "presets.abc",
      "{}",
    );
    expect(store.read()).toEqual({ abc: "{}" });

    await store.remove("abc");
    expect(user.unsetFlag).toHaveBeenCalledWith(
      "modular-av-audio-mixer",
      "presets.abc",
    );
    expect(store.read()).toEqual({});
  });

  it("reads none before any is saved", () => {
    const { user, settings } = fakeFoundry();
    const store = foundryPresetStore({
      user: () => user,
      getSetting: (key) => settings.get(key),
      setSetting: () => Promise.resolve(),
      onUserChange: () => () => undefined,
    });

    expect(store.read()).toEqual({});
  });

  it("keeps the active preset per device", async () => {
    // Arrange
    const { user, settings } = fakeFoundry();
    const store = foundryPresetStore({
      user: () => user,
      getSetting: (key) => settings.get(key),
      setSetting: (key, value) => {
        settings.set(key, value);
        return Promise.resolve();
      },
      onUserChange: () => () => undefined,
    });

    // Act
    await store.setActiveId("abc");

    // Assert
    expect(store.activeId()).toBe("abc");
    expect(settings.get("activePreset")).toBe("abc");
  });

  it("registers next and previous, unbound until a player binds them", () => {
    // Arrange
    const register = vi.fn();
    const step = vi.fn();
    registerPresetKeys({ register }, step);

    // Act
    const calls = register.mock.calls as [
      string,
      string,
      { onDown(): void; editable: unknown[] },
    ][];
    for (const [, , data] of calls) data.onDown();

    // Assert
    expect(calls.map(([, key]) => key)).toEqual([
      "nextPreset",
      "previousPreset",
    ]);
    expect(calls.every(([, , data]) => data.editable.length === 0)).toBe(true);
    expect(step.mock.calls).toEqual([[1], [-1]]);
  });
});

describe("a macro's way in", () => {
  const cave = { id: "a", name: "Cave", effects: {} };

  function setup(asGM = true) {
    const apply = vi.fn(() => Promise.resolve());
    const gmLayers = {
      applyPreset: vi.fn(() => Promise.resolve()),
      set: vi.fn(() => Promise.resolve()),
      end: vi.fn(() => Promise.resolve()),
    };
    const api = macroApi(() =>
      Promise.resolve({
        presets: {
          list: () => [cave],
          apply,
          step: () => Promise.resolve(null),
        },
        gmLayers: asGM ? gmLayers : null,
      }),
    );
    return { api, apply, gmLayers };
  }

  it("lists names, and applies by name, whatever its case", async () => {
    // Arrange
    const { api, apply } = setup();

    // Act
    const found = await api.presets.apply("cave");
    const unknown = await api.presets.apply("attic");

    // Assert
    await expect(api.presets.list()).resolves.toEqual(["Cave"]);
    expect(found).toBe(true);
    expect(unknown).toBe(false);
    expect(apply).toHaveBeenCalledOnce();
  });

  it("enters the cave and leaves it", async () => {
    const { api, gmLayers } = setup();

    await api.layers.apply("cave");
    await api.layers.end();

    expect(gmLayers.applyPreset).toHaveBeenCalledWith(cave, {
      target: "table",
      includeGMs: false,
    });
    expect(gmLayers.end).toHaveBeenCalledWith("table");
  });

  it("reaches one player", async () => {
    const { api, gmLayers } = setup();

    await api.layers.set({ label: "Orc", effects: {} }, { user: "p1" });

    expect(gmLayers.set).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ label: "Orc" }),
    );
  });

  it("says when a preset doesn't exist", async () => {
    const { api, gmLayers } = setup();

    await expect(api.layers.apply("attic")).resolves.toBe(false);
    expect(gmLayers.applyPreset).not.toHaveBeenCalled();
  });

  it("refuses a player", async () => {
    const { api } = setup(false);

    await expect(api.layers.end()).rejects.toThrow("GM");
  });
});
