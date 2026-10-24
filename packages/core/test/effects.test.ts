import {
  createFakeAudioEffect,
  createFakeVideoEffect,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Loaded lazily by the core; preloaded so its import resolves within settle().
import "../src/media/camera.ts";
import { ALWAYS, captureOf, createTable, type Tab } from "./table.ts";

const EFFECTS_SETTING = "effects";

const savedEffects = (tab: Tab): unknown =>
  tab.client.game.settings.get("modular-av", EFFECTS_SETTING);

const cameraOf = (tab: Tab): MediaStreamTrack | null =>
  tab.core.controller().local.camera;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("effects in the state", () => {
  it("lists every registered effect, off or unsupported", async () => {
    const table = createTable();
    const rnnoise = createFakeAudioEffect("rnnoise");
    const krisp = createFakeAudioEffect("krisp", { supported: false });

    const p1 = table.join("p1", {
      effects: [rnnoise.definition, krisp.definition],
    });
    await table.settle();

    expect(p1.api.state.get().local.effects).toEqual({
      rnnoise: { status: "off", error: null },
      krisp: { status: "unsupported", error: null },
    });
  });
});

describe("turning effects on and off", () => {
  it("runs a microphone effect in the chain and saves the choice", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const rnnoise = createFakeAudioEffect("rnnoise");
    const p1 = table.join("p1", { av: ALWAYS, effects: [rnnoise.definition] });
    await table.settle();

    // Act
    await p1.api.commands.setEffectEnabled("rnnoise", true);
    await table.settle();

    // Assert
    expect(p1.api.state.get().local.effects.rnnoise?.status).toBe("running");
    expect(savedEffects(p1)).toEqual(["rnnoise"]);
    const node = rnnoise.instances[0]?.input;
    const source = captureOf(p1).sources[0]?.node;
    expect(node && source && captureOf(p1).graph.reaches(source, node)).toBe(
      true,
    );
  });

  it("turns an effect off and forgets it", async () => {
    const table = createTable();
    const rnnoise = createFakeAudioEffect("rnnoise");
    const p1 = table.join("p1", { av: ALWAYS, effects: [rnnoise.definition] });
    await table.settle();
    await p1.api.commands.setEffectEnabled("rnnoise", true);
    await table.settle();

    await p1.api.commands.setEffectEnabled("rnnoise", false);
    await table.settle();

    expect(p1.api.state.get().local.effects.rnnoise?.status).toBe("off");
    expect(rnnoise.instances[0]?.disposed).toBe(true);
    expect(savedEffects(p1)).toEqual([]);
  });

  it("replaces the running effect of a group once the new one runs", async () => {
    const table = createTable();
    const group = { exclusiveGroup: "noise-suppression" };
    const rnnoise = createFakeAudioEffect("rnnoise", group);
    const speex = createFakeAudioEffect("speex", group);
    const p1 = table.join("p1", {
      av: ALWAYS,
      effects: [rnnoise.definition, speex.definition],
    });
    await table.settle();
    await p1.api.commands.setEffectEnabled("rnnoise", true);
    await table.settle();

    await p1.api.commands.setEffectEnabled("speex", true);
    await table.settle();

    expect(p1.api.state.get().local.effects).toMatchObject({
      rnnoise: { status: "off" },
      speex: { status: "running" },
    });
    expect(savedEffects(p1)).toEqual(["speex"]);
  });

  it("keeps the newest choice of a group, even if the older one starts later", async () => {
    const table = createTable();
    const group = { exclusiveGroup: "noise-suppression" };
    const fast = createFakeAudioEffect("rnnoise", group);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The older choice takes longer to start than the newer one.
    const rnnoise = {
      ...fast.definition,
      create: async (context: Parameters<typeof fast.definition.create>[0]) => {
        await held;
        return fast.definition.create(context);
      },
    };
    const speex = createFakeAudioEffect("speex", group);
    const p1 = table.join("p1", {
      av: ALWAYS,
      effects: [rnnoise, speex.definition],
    });
    await table.settle();

    // Both asked for before either runs.
    await p1.api.commands.setEffectEnabled("rnnoise", true);
    await p1.api.commands.setEffectEnabled("speex", true);
    await table.settle();
    release();
    await table.settle();

    expect(savedEffects(p1)).toEqual(["speex"]);
    expect(p1.api.state.get().local.effects.speex?.status).toBe("running");
  });

  it("checks its arguments", async () => {
    const table = createTable();
    const rnnoise = createFakeAudioEffect("rnnoise");
    const p1 = table.join("p1", { effects: [rnnoise.definition] });
    await table.settle();

    await expect(
      p1.api.commands.setEffectEnabled(
        "rnnoise",
        "false" as unknown as boolean,
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      p1.api.commands.setDevice("audioInput", "x".repeat(257)),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("refuses unknown and unsupported effects", async () => {
    const table = createTable();
    const krisp = createFakeAudioEffect("krisp", { supported: false });
    const p1 = table.join("p1", { effects: [krisp.definition] });
    await table.settle();

    await expect(
      p1.api.commands.setEffectEnabled("nope", true),
    ).rejects.toMatchObject({ code: "unknown-effect" });
    await expect(
      p1.api.commands.setEffectEnabled("krisp", true),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      p1.api.commands.setEffectEnabled("krisp", false),
    ).resolves.toBeUndefined();
  });
});

describe("camera effects fail closed", () => {
  it("keeps the camera off until the effect's frames flow, then sends only those", async () => {
    // Arrange
    const table = createTable();
    const gm = table.join("gm", { secret: true });
    const blur = createFakeVideoEffect("blur");
    const p1 = table.join("p1", { effects: [blur.definition] });
    await table.settle();
    const raw = cameraOf(p1);

    // Act
    await p1.api.commands.setEffectEnabled("blur", true);
    const held = {
      camera: cameraOf(p1),
      hold: p1.api.state.get().local.cameraHold,
    };
    await table.settle();
    p1.env.frame(blur.instances[0]?.output);
    await table.settle();

    // Assert
    expect(raw).not.toBeNull();
    expect(held).toEqual({ camera: null, hold: "effect-starting" });
    expect(cameraOf(p1)).toBe(blur.instances[0]?.output);
    expect(p1.api.state.get().local.cameraHold).toBeNull();
    const seen = gm.core.controller().remote.videoStream("p1");
    expect(seen?.getVideoTracks()).toEqual([blur.instances[0]?.output]);
  });

  it("tells the player plainly when the effect failed and the camera stays off", async () => {
    const table = createTable();
    const blur = createFakeVideoEffect("blur", { fail: new Error("no GPU") });
    const p1 = table.join("p1", { effects: [blur.definition] });
    await table.settle();

    await p1.api.commands.setEffectEnabled("blur", true);
    await table.settle();

    expect(cameraOf(p1)).toBeNull();
    expect(p1.api.state.get().local.cameraHold).toBe("effect-failed");
    expect(p1.client.notifications.map((n) => n.message)).toContain(
      "Voice and video: your camera effect failed, so your camera stays off. Turn the effect off to show your camera.",
    );
  });

  it("tells the player when a microphone effect failed and audio goes on without it", async () => {
    const table = createTable();
    const rnnoise = createFakeAudioEffect("rnnoise", {
      fail: new Error("no wasm"),
    });
    const p1 = table.join("p1", { av: ALWAYS, effects: [rnnoise.definition] });
    await table.settle();

    await p1.api.commands.setEffectEnabled("rnnoise", true);
    await table.settle();

    expect(p1.api.state.get().local.effects.rnnoise?.status).toBe("failed");
    expect(p1.client.notifications.map((n) => n.message)).toContain(
      "Voice and video: a microphone effect failed; your microphone goes on without it.",
    );
  });
});
