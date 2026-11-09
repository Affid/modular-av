import type { AudioPipelineChange, AudioPlace } from "@modular-av/api";
import {
  createFakeAudioEffect,
  createFakeVideoEffect,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALWAYS,
  captureOf,
  createTable,
  micEnabled,
  type Tab,
} from "./table.ts";

const voiceOf = (p1: Tab) => p1.api.state.get().local;

/** One running send effect, one more that is off, and a video effect. */
async function setup() {
  const table = createTable();
  table.join("gm", { secret: true });
  const reverb = createFakeAudioEffect("reverb", { defaultPlace: "send" });
  const radio = createFakeAudioEffect("radio", { defaultPlace: "post-gate" });
  const blur = createFakeVideoEffect("blur");
  const p1 = table.join("p1", {
    av: ALWAYS,
    effects: [
      { ...reverb.definition, defaultMix: 0.3 },
      radio.definition,
      blur.definition,
    ],
  });
  await table.settle();
  await p1.api.commands.setEffectEnabled("reverb", true);
  await table.settle();
  return { table, p1 };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("changing the audio pipeline at once", () => {
  it("writes places, order, mix and Channel level together", async () => {
    // Arrange
    const { table, p1 } = await setup();

    // Act
    await p1.api.commands.setAudioPipeline({
      places: { radio: "send" },
      order: { send: ["radio", "reverb"] },
      mix: { radio: 0.4, reverb: 0.6 },
      channelLevel: 0.5,
    });
    await table.settle();

    // Assert
    const local = voiceOf(p1);
    expect(local.audioEffectPlaces).toMatchObject({
      radio: "send",
      reverb: "send",
    });
    expect(local.audioEffectOrder.send).toEqual(["radio", "reverb"]);
    expect(local.audioEffectMix).toEqual({ radio: 0.4, reverb: 0.6 });
    expect(local.audioChannelLevel).toBe(0.5);
    expect(captureOf(p1).level("return:reverb")?.level).toBe(0.6);
  });

  it("applies once, so a running effect moves once", async () => {
    // Arrange
    const { table, p1 } = await setup();
    const { local } = p1.core.controller();
    const placed = vi.spyOn(local, "setPlacement");

    // Act
    await p1.api.commands.setAudioPipeline({
      places: { reverb: "post-gate", radio: "pre-gate" },
      order: { "post-gate": ["reverb"] },
      channelLevel: 0.5,
    });
    await table.settle();

    // Assert
    expect(placed).toHaveBeenCalledTimes(1);
    expect(placed.mock.calls[0]?.[0].places).toMatchObject({
      reverb: "post-gate",
      radio: "pre-gate",
    });
  });

  it("checks mix against the places in the same change", async () => {
    // Arrange: radio has no mix until it is on a send.
    const { p1 } = await setup();
    await expect(
      p1.api.commands.setAudioEffectMix("radio", 0.4),
    ).rejects.toMatchObject({ code: "invalid-argument" });

    // Act
    await p1.api.commands.setAudioPipeline({
      places: { radio: "send" },
      mix: { radio: 0.4 },
    });

    // Assert
    expect(voiceOf(p1).audioEffectMix.radio).toBe(0.4);
  });

  it("refuses a mix for an effect the change moves off its send", async () => {
    const { p1 } = await setup();

    await expect(
      p1.api.commands.setAudioPipeline({
        places: { reverb: "post-gate" },
        mix: { reverb: 0.4 },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("leaves out what isn't given", async () => {
    // Arrange
    const { table, p1 } = await setup();
    await p1.api.commands.setAudioChannelLevel(0.5);
    await p1.api.commands.setAudioEffectMix("reverb", 0.6);

    // Act
    await p1.api.commands.setAudioPipeline({ order: { send: ["reverb"] } });
    await table.settle();

    // Assert
    expect(voiceOf(p1).audioChannelLevel).toBe(0.5);
    expect(voiceOf(p1).audioEffectMix.reverb).toBe(0.6);
  });

  it("keeps an order given for another place", async () => {
    // Arrange
    const { table, p1 } = await setup();
    await p1.api.commands.setAudioEffectOrder("post-gate", ["radio"]);

    // Act
    await p1.api.commands.setAudioPipeline({ order: { send: ["reverb"] } });
    await table.settle();

    // Assert
    expect(voiceOf(p1).audioEffectOrder).toMatchObject({
      "post-gate": ["radio"],
      send: ["reverb"],
    });
  });

  it.each<[string, AudioPipelineChange, string]>([
    [
      "an unknown effect's place",
      { places: { nope: "send" } },
      "unknown-effect",
    ],
    [
      "a video effect's place",
      { places: { blur: "send" } },
      "invalid-argument",
    ],
    [
      "an unknown place",
      { places: { reverb: "master" as AudioPlace } },
      "invalid-argument",
    ],
    [
      "an order for an unknown place",
      { order: { ["master" as AudioPlace]: ["reverb"] } },
      "invalid-argument",
    ],
    [
      "an unknown effect in an order",
      { order: { send: ["nope"] } },
      "unknown-effect",
    ],
    [
      "a repeat in an order",
      { order: { send: ["reverb", "reverb"] } },
      "invalid-argument",
    ],
    [
      "an order that isn't a list",
      { order: { send: "reverb" as unknown as string[] } },
      "invalid-argument",
    ],
    ["a mix out of range", { mix: { reverb: 2 } }, "invalid-argument"],
    ["a mix for an unknown effect", { mix: { nope: 0.5 } }, "unknown-effect"],
    ["a video effect's mix", { mix: { blur: 0.5 } }, "invalid-argument"],
    ["a Channel level out of range", { channelLevel: -1 }, "invalid-argument"],
    [
      "a Channel level that isn't a number",
      { channelLevel: "1" as unknown as number },
      "invalid-argument",
    ],
  ])("refuses %s and writes nothing", async (_, bad, code) => {
    // Arrange
    const { table, p1 } = await setup();
    const before = voiceOf(p1);

    // Act: the good parts come first, the bad one must stop them too.
    await expect(
      p1.api.commands.setAudioPipeline({
        places: { radio: "send" },
        channelLevel: 0.5,
        ...bad,
      }),
    ).rejects.toMatchObject({ code });
    await table.settle();

    // Assert
    expect(voiceOf(p1).audioEffectPlaces).toEqual(before.audioEffectPlaces);
    expect(voiceOf(p1).audioChannelLevel).toBe(before.audioChannelLevel);
  });

  it("refuses something that isn't a change", async () => {
    const p1 = createTable().join("p1");

    await expect(
      p1.api.commands.setAudioPipeline(null as unknown as AudioPipelineChange),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects, never throws", () => {
    const p1 = createTable().join("p1");

    const result = p1.api.commands.setAudioPipeline({ channelLevel: 2 });

    expect(result).toBeInstanceOf(Promise);
    return expect(result).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("the effects a player chose", () => {
  it("are listed without a microphone, where every effect reads off", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const reverb = createFakeAudioEffect("reverb", { defaultPlace: "send" });
    const p1 = table.join("p1", {
      av: ALWAYS,
      deny: { audio: "NotAllowedError" },
      effects: [reverb.definition],
    });
    await table.settle();

    // Act
    await p1.api.commands.setEffectEnabled("reverb", true);
    await table.settle();

    // Assert
    expect(voiceOf(p1).chosenEffects).toEqual(["reverb"]);
    expect(voiceOf(p1).effects.reverb?.status).toBe("off");
  });

  it("drop an effect its exclusive group replaced", async () => {
    // Arrange
    const table = createTable();
    table.join("gm", { secret: true });
    const first = createFakeAudioEffect("first", { exclusiveGroup: "noise" });
    const second = createFakeAudioEffect("second", { exclusiveGroup: "noise" });
    const p1 = table.join("p1", {
      av: ALWAYS,
      effects: [first.definition, second.definition],
    });
    await table.settle();
    await p1.api.commands.setEffectEnabled("first", true);
    await table.settle();

    // Act
    await p1.api.commands.setEffectEnabled("second", true);
    await table.settle();

    // Assert
    expect(voiceOf(p1).chosenEffects).toEqual(["second"]);
  });

  it("drop an effect turned off, and one no longer registered", async () => {
    // Arrange
    const { table, p1 } = await setup();
    await p1.api.commands.setEffectEnabled("radio", true);
    await table.settle();
    expect(voiceOf(p1).chosenEffects).toEqual(["reverb", "radio"]);

    // Act
    await p1.api.commands.setEffectEnabled("reverb", false);
    await p1.client.game.settings.set("modular-av", "audioEffects", [
      "radio",
      "gone",
    ]);
    p1.core.controller().refresh();
    await table.settle();

    // Assert
    expect(voiceOf(p1).chosenEffects).toEqual(["radio"]);
  });
});

describe("the voice preview", () => {
  it("is a copy of what is sent: stopping it leaves the sent track", async () => {
    // Arrange
    const { p1 } = await setup();
    const sent = p1.core.controller().local.microphone;

    // Act
    const stream = p1.api.preview.voice();
    const [track] = stream?.getAudioTracks() ?? [];
    track?.stop();

    // Assert
    expect(track).toBeDefined();
    expect(track).not.toBe(sent);
    expect(sent?.readyState).toBe("live");
  });

  it("stays on while muted: Mute silences it in the graph, and can end", async () => {
    // Arrange
    const { table, p1 } = await setup();
    await p1.api.commands.setMuted(true);
    await table.settle();

    // Act
    const [track] = p1.api.preview.voice()?.getAudioTracks() ?? [];

    // Assert
    expect(micEnabled(p1)).toBe(false);
    expect(track?.enabled).toBe(true);
  });

  it("hears through Mute while it lives, and the table still hears nothing", async () => {
    // Arrange
    const { table, p1 } = await setup();
    await p1.api.commands.setMuted(true);
    await table.settle();
    const mute = () => p1.env.captureContexts[0]?.level("mute")?.level;
    const before = mute();

    // Act
    const [track] = p1.api.preview.voice()?.getAudioTracks() ?? [];
    const during = { mute: mute(), sent: micEnabled(p1) };
    track?.stop();

    // Assert
    expect(before).toBe(0);
    expect(during).toEqual({ mute: 1, sent: false });
    expect(mute()).toBe(0);
  });

  it("is null without a microphone", async () => {
    const table = createTable();
    table.join("gm", { secret: true });
    const p1 = table.join("p1", {
      av: ALWAYS,
      deny: { audio: "NotAllowedError" },
    });
    await table.settle();

    expect(p1.api.preview.voice()).toBeNull();
  });
});
