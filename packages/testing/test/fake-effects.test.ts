import { describe, expect, it } from "vitest";
import { createFakeCaptureContext } from "../src/media/fake-audio.ts";
import {
  createFakeAudioEffect,
  createFakeVideoEffect,
} from "../src/media/fake-effects.ts";
import { createFakeTrack } from "../src/service/fake-track.ts";

const context = () => ({
  signal: new AbortController().signal,
  fail: () => undefined,
});

describe("fake effects", () => {
  it("makes audio effects from a gain node of the capture context", async () => {
    // Arrange
    const capture = createFakeCaptureContext();
    const fake = createFakeAudioEffect("rnnoise", {
      stage: "voice",
      exclusiveGroup: "noise-suppression",
    });

    // Act
    const effect = await fake.definition.create({
      ...context(),
      audioContext: capture.audioContext,
    });
    effect.dispose();

    // Assert
    expect(fake.definition).toMatchObject({
      id: "rnnoise",
      kind: "audio",
      stage: "voice",
      exclusiveGroup: "noise-suppression",
    });
    expect(capture.graph.labelOf(effect.input)).toBe("gain");
    expect(fake.instances[0]?.disposed).toBe(true);
    expect(fake.contexts).toHaveLength(1);
    expect(fake.definition.isSupported()).toBe(true);
  });

  it("makes video effects that start at once and record their inputs", async () => {
    const fake = createFakeVideoEffect("blur", { exclusiveGroup: "x" });
    const cam = createFakeTrack("video", "cam");
    const next = createFakeTrack("video", "next");

    const effect = await fake.definition.create(context());
    const output = await effect.start(cam);
    await effect.replaceInput(next);
    effect.dispose();

    expect(output).toBe(fake.instances[0]?.output);
    expect(fake.instances[0]?.inputs).toEqual([cam, next]);
    expect(fake.instances[0]?.disposed).toBe(true);
    expect(fake.contexts).toHaveLength(1);
    expect(fake.definition.exclusiveGroup).toBe("x");
  });

  it("fails or reports unsupported on request", async () => {
    const error = new Error("no wasm");
    const audio = createFakeAudioEffect("a", { fail: error, supported: false });
    const video = createFakeVideoEffect("v", { fail: error, supported: false });
    const capture = createFakeCaptureContext();

    await expect(
      audio.definition.create({
        ...context(),
        audioContext: capture.audioContext,
      }),
    ).rejects.toBe(error);
    await expect(video.definition.create(context())).rejects.toBe(error);
    expect(audio.definition.isSupported()).toBe(false);
    expect(video.definition.isSupported()).toBe(false);
    expect(audio.definition.exclusiveGroup).toBeUndefined();
    expect(video.definition.exclusiveGroup).toBeUndefined();
  });
});
