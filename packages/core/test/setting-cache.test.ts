import { createFakeWorld, createHooks } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import type {
  FoundrySettingConfig,
  FoundrySettings,
} from "../src/foundry/globals.ts";
import {
  cachedSettings,
  withCachedSettings,
} from "../src/settings/setting-cache.ts";
import { USERS } from "./table.ts";

const GATE = "modular-av.gateFallback";

/**
 * Foundry's settings as far as the cache sees them: every read counted,
 * `set` calls `onChange` as Foundry does, `change` changes a value with no
 * `onChange` (a deleted Setting, another tab).
 */
function fakeFoundrySettings() {
  let configs = new Map<string, FoundrySettingConfig>();
  let values = new Map<string, unknown>();
  let failing = new Set<string>();
  let reads: readonly string[] = [];
  const settings: FoundrySettings = {
    menus: new Map(),
    register(namespace, key, config) {
      configs = new Map(configs).set(`${namespace}.${key}`, config);
    },
    registerMenu(namespace, key, config) {
      settings.menus.set(`${namespace}.${key}`, { type: config.type });
    },
    get(namespace, key) {
      const id = `${namespace}.${key}`;
      reads = [...reads, id];
      const config = configs.get(id);
      if (!config || failing.has(id))
        throw new Error(`"${id}" is not a registered game setting`);
      return values.has(id) ? values.get(id) : config.default;
    },
    set(namespace, key, value) {
      const id = `${namespace}.${key}`;
      values = new Map(values).set(id, value);
      configs.get(id)?.onChange?.(value, { diff: true }, "gm");
      return Promise.resolve(value);
    },
  };
  return {
    settings,
    reads: () => reads,
    change(id: string, value: unknown) {
      values = new Map(values).set(id, value);
    },
    fail(id: string, fails: boolean) {
      failing = new Set(failing);
      if (fails) failing.add(id);
      else failing.delete(id);
    },
  };
}

const setup = () => {
  const foundry = fakeFoundrySettings();
  const hooks = createHooks();
  const settings = cachedSettings(foundry.settings, hooks);
  return { foundry, hooks, settings };
};

const register = (
  settings: FoundrySettings,
  key = "gateFallback",
  extra: Partial<FoundrySettingConfig> = {},
): void => {
  settings.register("modular-av", key, {
    scope: "client",
    config: false,
    default: "mute",
    ...extra,
  });
};

describe("settings read through the cache", () => {
  it("ask Foundry once for a setting registered through it", () => {
    // Arrange
    const { foundry, settings } = setup();
    register(settings);

    // Act
    const values = [1, 2, 3].map(() =>
      settings.get("modular-av", "gateFallback"),
    );

    // Assert
    expect(values).toEqual(["mute", "mute", "mute"]);
    expect(foundry.reads()).toEqual([GATE]);
  });

  it("read the new value in the setting's own onChange", async () => {
    // Arrange: Foundry calls onChange before its hooks say anything.
    const { settings } = setup();
    let seen: unknown[] = [];
    register(settings, "gateFallback", {
      onChange: (value) => {
        seen = [...seen, value, settings.get("modular-av", "gateFallback")];
      },
    });
    settings.get("modular-av", "gateFallback");

    // Act
    await settings.set("modular-av", "gateFallback", "talk");

    // Assert
    expect(seen).toEqual(["talk", "talk"]);
    expect(settings.get("modular-av", "gateFallback")).toBe("talk");
  });

  it("pass Foundry's options and user on to the setting's own onChange", async () => {
    // Arrange
    const { settings } = setup();
    let calls: unknown[][] = [];
    register(settings, "gateFallback", {
      onChange: (...args) => {
        calls = [...calls, args];
      },
    });

    // Act
    await settings.set("modular-av", "gateFallback", "talk");

    // Assert
    expect(calls).toEqual([["talk", { diff: true }, "gm"]]);
  });

  it.each([
    ["createSetting", { key: GATE }],
    ["updateSetting", { key: GATE }],
    ["deleteSetting", { key: GATE }],
    ["clientSettingChanged", GATE],
  ])("forget a value when Foundry's %s hook names it", (hook, argument) => {
    // Arrange
    const { foundry, hooks, settings } = setup();
    register(settings);
    settings.get("modular-av", "gateFallback");
    foundry.change(GATE, "talk");

    // Act
    hooks.callAll(hook, argument, {}, {});

    // Assert
    expect(settings.get("modular-av", "gateFallback")).toBe("talk");
    expect(foundry.reads()).toEqual([GATE, GATE]);
  });

  it("keep the other values when one setting changes", () => {
    // Arrange
    const { foundry, hooks, settings } = setup();
    register(settings);
    register(settings, "screenShare", { scope: "world", default: "video" });
    settings.get("modular-av", "gateFallback");
    settings.get("modular-av", "screenShare");

    // Act
    hooks.callAll("updateSetting", { key: GATE }, {}, {});
    settings.get("modular-av", "screenShare");

    // Assert
    expect(foundry.reads()).toEqual([GATE, "modular-av.screenShare"]);
  });

  it("read a setting registered elsewhere from Foundry every time", () => {
    // Arrange: Foundry's own, or a module's registered without the core.
    const { foundry, settings } = setup();
    foundry.settings.register("core", "rtcWorldSettings", {
      scope: "world",
      default: { mode: 0 },
    });

    // Act
    settings.get("core", "rtcWorldSettings");
    settings.get("core", "rtcWorldSettings");

    // Assert
    expect(foundry.reads()).toEqual([
      "core.rtcWorldSettings",
      "core.rtcWorldSettings",
    ]);
  });

  it("keep nothing from a read that failed", () => {
    // Arrange
    const { foundry, settings } = setup();
    register(settings);
    foundry.fail(GATE, true);
    expect(() => settings.get("modular-av", "gateFallback")).toThrow();
    foundry.fail(GATE, false);

    // Act
    const value = settings.get("modular-av", "gateFallback");

    // Assert
    expect(value).toBe("mute");
    expect(foundry.reads()).toEqual([GATE, GATE]);
  });

  it("start again from Foundry when a setting is registered again", () => {
    // Arrange
    const { settings } = setup();
    register(settings);
    settings.get("modular-av", "gateFallback");

    // Act
    register(settings, "gateFallback", { default: "talk" });

    // Assert
    expect(settings.get("modular-av", "gateFallback")).toBe("talk");
  });

  it("pass writes and menus through to Foundry", async () => {
    // Arrange
    const { foundry, settings } = setup();
    register(settings);
    class Menu {
      render(): void {
        // A menu Foundry would open.
      }
    }

    // Act
    await settings.set("modular-av", "gateFallback", "talk");
    settings.registerMenu("modular-av", "voices", {
      name: "Voices",
      label: "Voices",
      type: Menu,
      restricted: false,
    });

    // Assert
    expect(foundry.settings.get("modular-av", "gateFallback")).toBe("talk");
    expect(settings.menus).toBe(foundry.settings.menus);
    expect(settings.menus.get("modular-av.voices")?.type).toBe(Menu);
  });
});

describe("the game the core reads its settings through", () => {
  it("is Foundry's game, live, with the cached settings", () => {
    // Arrange
    const world = createFakeWorld({
      users: USERS,
      modules: [{ id: "modular-av", version: "0.1.0" }],
    });
    const client = world.connect("p1");
    const game = withCachedSettings(client.game, client.Hooks);
    expect(game.ready).toBe(false);

    // Act
    client.runLifecycle();

    // Assert
    expect(game.ready).toBe(true);
    expect(game.user).toBe(client.game.user);
    expect(game.users).toBe(client.game.users);
    expect(game.userId).toBe("p1");
    expect(game.webrtc).toBe(client.game.webrtc);
    expect(game.settings).not.toBe(client.game.settings);
    expect(game.settings.menus).toBe(client.game.settings.menus);
  });
});
