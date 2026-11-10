import type { ModularAV } from "@modular-av/api";
import {
  createFakeAudioEffect,
  createFakeVideoEffect,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS, createTable, master, type TabOptions } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const MODULE = "modular-av-sample";

/** A module that keeps one setting for the player and one for the device. */
const sample: TabOptions["register"] = (api: ModularAV) => {
  api.settings.register(MODULE, "level", {
    storage: "player",
    type: Number,
    default: 1,
  });
  api.settings.register(MODULE, "quality", {
    storage: "device",
    type: String,
    default: "standard",
  });
};

describe("a module's settings", () => {
  it("are kept in Foundry's user scope for the player and client scope for the device", async () => {
    // Arrange / Act
    const table = createTable();
    const p1 = table.join("p1", { register: sample });
    await table.settle();

    // Assert
    const scope = (key: string) =>
      p1.client.game.settings.settings.get(`${MODULE}.${key}`)?.scope;
    expect([scope("level"), scope("quality")]).toEqual(["user", "client"]);
    expect(p1.api.settings.storageOf(MODULE, "level")).toBe("player");
    expect(p1.api.settings.storageOf(MODULE, "nothing")).toBeNull();
  });

  it("follow the player to another browser, while the device's stay behind", async () => {
    // Arrange
    const table = createTable();
    const first = table.join("p1", { register: sample });
    await table.settle();
    await first.api.settings.set(MODULE, "level", 3);
    await first.api.settings.set(MODULE, "quality", "high");
    first.client.disconnect();

    // Act: another address, so another browser storage.
    const second = table.join("p1", { register: sample });
    await table.settle();

    // Assert
    expect(second.api.settings.get(MODULE, "level")).toBe(3);
    expect(second.api.settings.get(MODULE, "quality")).toBe("standard");
  });

  it("move what this browser kept before to the player, once, when the game is ready", async () => {
    // Arrange: a browser that saved "level" back when it was a device setting.
    const table = createTable();
    const first = table.join("p1", {
      register: sample,
      stored: { [`${MODULE}.level`]: 5 },
    });
    await table.settle();
    first.client.disconnect();

    // Act: another browser with an older value of its own.
    const second = table.join("p1", {
      register: sample,
      stored: { [`${MODULE}.level`]: 7 },
    });
    await table.settle();

    // Assert: the player's value, moved once, wins.
    expect(first.api.settings.get(MODULE, "level")).toBe(5);
    expect(second.api.settings.get(MODULE, "level")).toBe(5);
  });

  it("save one at a time, the last one standing", async () => {
    const table = createTable();
    const p1 = table.join("p1", { register: sample });
    await table.settle();

    await Promise.all(
      [1, 2, 3].map((v) => p1.api.settings.set(MODULE, "level", v)),
    );

    expect(p1.api.settings.get(MODULE, "level")).toBe(3);
  });

  it("refuse a setting declared without a known storage, module or key", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    const bad = [
      () => {
        p1.api.settings.register(MODULE, "x", {
          storage: "server" as never,
          type: Number,
          default: 0,
        });
      },
      () => {
        p1.api.settings.register("", "x", {
          storage: "device",
          type: Number,
          default: 0,
        });
      },
      () => {
        p1.api.settings.register(MODULE, "", {
          storage: "device",
          type: Number,
          default: 0,
        });
      },
    ];

    for (const register of bad)
      expect(register).toThrow(
        expect.objectContaining({ code: "invalid-argument" }),
      );
  });
});

describe("the core's own settings", () => {
  const effects = () => [
    createFakeAudioEffect("reverb", { defaultPlace: "send" }).definition,
    createFakeAudioEffect("radio", { defaultPlace: "post-gate" }).definition,
    createFakeVideoEffect("blur").definition,
  ];

  it("keep the player's voice effects and how they run, but the camera's on this device", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const first = table.join("p1", { av: ALWAYS, effects: effects() });
    await table.settle();
    await first.api.commands.setEffectEnabled("reverb", true);
    await first.api.commands.setEffectEnabled("blur", true);
    await first.api.commands.setAudioEffectMix("reverb", 0.4);
    await first.api.commands.setAudioEffectPlace("radio", "pre-gate");
    await first.api.commands.setInputSensitivity({
      auto: false,
      threshold: -40,
    });
    first.client.disconnect();

    // Act
    const second = table.join("p1", { av: ALWAYS, effects: effects() });
    await table.settle();

    // Assert
    const local = second.api.state.get().local;
    expect(local.chosenEffects).toEqual(["reverb"]);
    expect(local.audioEffectPlaces.radio).toBe("pre-gate");
    expect(local.audioEffectMix.reverb).toBe(0.4);
    expect(local.inputSensitivity).toEqual({ auto: true, threshold: -50 });
  });

  it("move a browser's earlier voice choices to the player, and leave the camera's", async () => {
    // Arrange / Act
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", {
      av: ALWAYS,
      effects: effects(),
      stored: {
        "modular-av.effects": ["reverb", "blur"],
        "modular-av.audioEffectPlaces": { radio: "pre-gate" },
      },
    });
    await table.settle();

    // Assert
    const userValue = (key: string) =>
      p1.client.game.settings.storage
        .get("user")
        .getSetting(`modular-av.${key}`)?.value;
    expect(userValue("audioEffects")).toEqual(["reverb"]);
    expect(userValue("audioEffectPlaces")).toEqual({ radio: "pre-gate" });
    expect([...p1.api.state.get().local.chosenEffects].sort()).toEqual([
      "blur",
      "reverb",
    ]);
  });

  it("don't claim the player's voice choices when only a camera effect changed", async () => {
    // Arrange: a browser with no voice effects turns the camera's on.
    const table = createTable();
    table.join("gm", { secret: true });
    const first = table.join("p1", { av: ALWAYS, effects: effects() });
    await table.settle();
    await first.api.commands.setEffectEnabled("blur", true);
    await table.settle();
    first.client.disconnect();

    // Act: a browser that kept voice choices from before loads later.
    const second = table.join("p1", {
      av: ALWAYS,
      effects: effects(),
      stored: { "modular-av.effects": ["reverb"] },
    });
    await table.settle();

    // Assert: they still moved to the player.
    expect(second.api.state.get().local.chosenEffects).toContain("reverb");
  });

  it("move the rest when Foundry refuses one value", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", {
      stored: {
        "modular-av.audioCutTails": true,
        "modular-av.audioChannelLevel": 0.5,
      },
    });
    const settings = p1.client.game.settings;
    const set = settings.set.bind(settings);
    vi.spyOn(settings, "set").mockImplementation((module, key, value) =>
      key === "audioCutTails"
        ? Promise.reject(new Error("refused"))
        : set(module, key, value),
    );

    // Act
    await table.settle();

    // Assert
    expect(p1.api.state.get().local.audioChannelLevel).toBe(0.5);
    expect(p1.errors).toContainEqual(new Error("refused"));
  });

  it("bring the player's volumes for the others to another browser", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const first = table.join("p1");
    await table.settle();
    await first.api.commands.setVolume("gm", 0.3);
    await table.settle();
    first.client.disconnect();

    // Act
    const second = table.join("p1");
    await table.settle();

    // Assert
    expect(master(second).settings.client.users.gm?.volume).toBe(0.3);
    expect(second.api.state.get().participants.gm?.volume).toBe(0.3);
  });

  it("move a browser's earlier volumes to the player", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const first = table.join("p1", {
      av: { users: { gm: { volume: 0.6 } } },
    });
    await table.settle();
    first.client.disconnect();

    const second = table.join("p1");
    await table.settle();

    expect(second.api.state.get().participants.gm?.volume).toBe(0.6);
  });
});
