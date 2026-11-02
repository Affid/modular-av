import { describe, expect, it, vi } from "vitest";
import { foundryPresetStore } from "../src/presets/foundry-store.ts";
import { registerPresetKeys } from "../src/presets/keys.ts";
import { macroApi } from "../src/presets/macro.ts";
import { fakeStore } from "./context.ts";

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
  const preset = (name: string) => JSON.stringify({ name, effects: {} });

  it("lists names, and applies by name, whatever its case", async () => {
    // Arrange
    const apply = vi.fn(() => Promise.resolve());
    const { store } = fakeStore({ a: preset("Cave") });
    const api = macroApi(() =>
      Promise.resolve({
        list: () => [{ id: "a", name: "Cave", effects: {} }],
        apply,
        step: () => Promise.resolve(null),
      }),
    );

    // Act
    const found = await api.presets.apply("cave");
    const unknown = await api.presets.apply("attic");

    // Assert
    await expect(api.presets.list()).resolves.toEqual(["Cave"]);
    expect(found).toBe(true);
    expect(unknown).toBe(false);
    expect(apply).toHaveBeenCalledOnce();
    expect(Object.keys(store.read())).toEqual(["a"]);
  });
});
