import type { VideoEffect, VideoEffectDefinition } from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeTrack,
  fakeTrackInfo,
} from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
// Loaded lazily by local-video.ts; preloaded so its import resolves at once.
import "../src/media/camera.ts";
import { createLocalVideo } from "../src/media/local-video.ts";

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** An effect that starts at once and sends a frame when asked. */
function blurEffect(): {
  definition: VideoEffectDefinition;
  output: MediaStreamTrack;
  inputs: MediaStreamTrack[];
} {
  const output = createFakeTrack("video", "blurred");
  const inputs: MediaStreamTrack[] = [];
  const effect: VideoEffect = {
    start(input) {
      inputs.push(input);
      return Promise.resolve(output);
    },
    replaceInput(input) {
      inputs.push(input);
      return Promise.resolve();
    },
    dispose: vi.fn(),
  };
  return {
    output,
    inputs,
    definition: {
      id: "blur",
      kind: "video",
      label: "Blur",
      cost: "heavy",
      isSupported: () => true,
      create: () => Promise.resolve(effect),
    },
  };
}

function setup() {
  const env = createFakeMediaEnv();
  const changes = vi.fn();
  const video = createLocalVideo({
    env,
    onChange: changes,
    onReplaced: vi.fn(),
    onError: vi.fn(),
  });
  return { env, video, changes };
}

const enabled = (track: MediaStreamTrack | null): boolean | undefined =>
  track ? fakeTrackInfo(track).enabled : undefined;

describe("local video", () => {
  it("sends the raw camera with the hide applied while no effect is wanted", async () => {
    // Arrange
    const { video } = setup();
    const raw = createFakeTrack("video", "cam");

    // Act
    await video.setInput(raw);
    const hidden = enabled(video.output);
    video.setEnabled(true);

    // Assert
    expect(video.output).toBe(raw);
    expect(hidden).toBe(false);
    expect(enabled(raw)).toBe(true);
    expect(video.hold).toBeNull();
    expect(video.effectStatus("blur")).toBeNull();
  });

  it("holds the camera at once when an effect is wanted, before its code loaded", async () => {
    const { video } = setup();
    const blur = blurEffect();
    await video.setInput(createFakeTrack("video", "cam"));

    video.setEffects([blur.definition], new Set(["blur"]));

    expect(video.output).toBeNull();
    expect(video.hold).toBe("effect-starting");
  });

  it("sends the effect's frames once flowing, the hide on them and the device feeding it", async () => {
    const { env, video } = setup();
    const blur = blurEffect();
    const raw = createFakeTrack("video", "cam");
    await video.setInput(raw);
    video.setEnabled(true);

    video.setEffects([blur.definition], new Set(["blur"]));
    await flush();
    env.frame(blur.output);
    await flush();
    const shown = video.output;
    video.setEnabled(false);

    expect(shown).toBe(blur.output);
    expect(video.effectStatus("blur")?.status).toBe("running");
    expect(enabled(blur.output)).toBe(false);
    expect(enabled(raw)).toBe(true);
  });

  it("feeds the device chosen while the camera chain loaded", async () => {
    const { video } = setup();
    const blur = blurEffect();
    await video.setInput(createFakeTrack("video", "usb"));

    video.setEffects([blur.definition], new Set(["blur"]));
    const headset = createFakeTrack("video", "headset");
    await video.setInput(headset);
    await flush();

    expect(blur.inputs.at(-1)).toBe(headset);
  });

  it("sends raw again through the chain once the effect is off", async () => {
    const { env, video } = setup();
    const blur = blurEffect();
    const raw = createFakeTrack("video", "cam");
    await video.setInput(raw);
    video.setEffects([blur.definition], new Set(["blur"]));
    await flush();
    env.frame(blur.output);
    await flush();

    video.setEffects([blur.definition], new Set());
    await flush();

    expect(video.output).toBe(raw);
    expect(video.hold).toBeNull();
  });

  it("sends nothing without a device", async () => {
    const { video } = setup();
    const blur = blurEffect();
    video.setEffects([blur.definition], new Set(["blur"]));

    await video.setInput(null);

    expect(video.output).toBeNull();
    expect(video.hold).toBeNull();
  });

  it("disposes the chain, even one still loading", async () => {
    const { video } = setup();
    const blur = blurEffect();
    await video.setInput(createFakeTrack("video", "cam"));
    video.setEffects([blur.definition], new Set(["blur"]));

    video.dispose();
    await flush();

    expect(video.output).toBeNull();
    expect(video.effectStatus("blur")).toBeNull();
  });
});
