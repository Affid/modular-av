import {
  createFakeMediaEnv,
  createFakeTrack,
  fakeTrackInfo,
} from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import type { GateConfig, MediaEnv } from "../src/media/env.ts";
import { createLocalMedia } from "../src/media/local-media.ts";

const BOTH = { audio: "default", video: "default" } as const;
const GATE: GateConfig = { mode: "detect", auto: true, threshold: -50 };

const create = (env: MediaEnv, errors: unknown[] = []) =>
  createLocalMedia(env, {
    gate: GATE,
    onReplaced: () => undefined,
    onError: (e) => errors.push(e),
  });

function setup(options?: Parameters<typeof createFakeMediaEnv>[0]) {
  const env = createFakeMediaEnv(options);
  return { env, media: create(env) };
}

/** The raw device tracks fed to the capture context, in order. */
const rawMics = (env: ReturnType<typeof createFakeMediaEnv>) =>
  env.captureContexts[0]?.sources.map((s) => s.track) ?? [];

const enabled = (track: MediaStreamTrack | null): boolean | undefined =>
  track ? fakeTrackInfo(track).enabled : undefined;

describe("local media", () => {
  it("captures muted tracks until the outbound state allows them", async () => {
    // Arrange
    const { env, media } = setup();

    // Act
    await media.acquire(BOTH);

    // Assert
    expect(env.captures).toEqual(["audio:default", "video:default"]);
    expect(enabled(media.microphone)).toBe(false);
    expect(enabled(media.camera)).toBe(false);
    media.setOutbound({ audio: true, video: false });
    expect(enabled(media.microphone)).toBe(true);
    expect(enabled(media.camera)).toBe(false);
  });

  it("sends the capture context's output, never the raw device", async () => {
    const { env, media } = setup();

    await media.acquire(BOTH);

    const [raw] = rawMics(env);
    expect(media.microphone).toBe(env.captureContexts[0]?.output);
    expect(raw).toBeDefined();
    expect(raw).not.toBe(media.microphone);
    expect(enabled(raw ?? null)).toBe(true);
  });

  it("applies the outbound state to tracks captured later", async () => {
    const { media } = setup();
    media.setOutbound({ audio: true, video: true });

    await media.acquire(BOTH);

    expect(enabled(media.microphone)).toBe(true);
    expect(enabled(media.camera)).toBe(true);
  });

  it("recaptures only the device that changed and stops the old one", async () => {
    // Arrange
    const { env, media } = setup();
    await media.acquire(BOTH);
    const oldMic = media.microphone;
    const oldCam = media.camera;
    const changed = vi.fn();
    media.onChange(changed);

    // Act
    await media.acquire({ audio: "headset", video: "default" });
    await media.acquire({ audio: "headset", video: "default" });

    // Assert
    expect(env.captures).toEqual([
      "audio:default",
      "video:default",
      "audio:headset",
    ]);
    const [oldRaw, newRaw] = rawMics(env);
    expect(media.camera).toBe(oldCam);
    expect(media.microphone).toBe(oldMic);
    expect(oldRaw && fakeTrackInfo(oldRaw).readyState).toBe("ended");
    expect(newRaw && fakeTrackInfo(newRaw).readyState).toBe("live");
    expect(changed).toHaveBeenCalled();
  });

  it("records why a capture failed and keeps the other kind", async () => {
    const { media } = setup({ deny: { video: "NotAllowedError" } });

    await media.acquire(BOTH);

    expect(media.camera).toBeNull();
    expect(media.microphone).not.toBeNull();
    expect(media.errors).toEqual({ audio: null, video: "NotAllowedError" });
  });

  it("drops a kind when its device is null and on release", async () => {
    // Arrange
    const { env, media } = setup();
    await media.acquire(BOTH);
    const cam = media.camera;
    const changed = vi.fn();
    media.onChange(changed);

    // Act
    await media.acquire({ audio: "default", video: null });

    // Assert
    expect(media.camera).toBeNull();
    expect(cam && fakeTrackInfo(cam).readyState).toBe("ended");
    media.release();
    const [raw] = rawMics(env);
    expect(media.microphone).toBeNull();
    expect(raw && fakeTrackInfo(raw).readyState).toBe("ended");
    const calls = changed.mock.calls.length;
    media.release();
    expect(changed.mock.calls.length).toBe(calls);
  });

  it("serializes overlapping acquisitions", async () => {
    const { env, media } = setup();

    await Promise.all([
      media.acquire(BOTH),
      media.acquire({ audio: "headset", video: "default" }),
    ]);

    expect(env.captures).toEqual([
      "audio:default",
      "video:default",
      "audio:headset",
    ]);
  });

  it("names non-DOM capture errors generically", async () => {
    const env = createFakeMediaEnv();
    const media = create({
      ...env,
      captureAudio: () => Promise.reject(new Error("weird")),
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection is the case under test
      captureVideo: () => Promise.reject("not an error"),
    });

    await media.acquire(BOTH);

    expect(media.errors).toEqual({ audio: "Error", video: "Error" });
  });

  it("keeps acquiring after one acquisition failed", async () => {
    // Arrange
    const env = createFakeMediaEnv();
    let fail = true;
    const media = create({
      ...env,
      createCaptureContext: () => {
        if (fail) return Promise.reject(new Error("no audio context"));
        return env.createCaptureContext();
      },
    });

    // Act / Assert
    await expect(media.acquire(BOTH)).rejects.toThrow(/no audio context/);
    fail = false;
    await media.acquire({ audio: "headset", video: "default" });
    expect(media.microphone).not.toBeNull();
  });

  it("stops tracks a capture returns after release", async () => {
    // Arrange
    const env = createFakeMediaEnv();
    let resolveMic: (track: MediaStreamTrack) => void = () => undefined;
    const media = create({
      ...env,
      captureAudio: () =>
        new Promise((resolve) => {
          resolveMic = resolve;
        }),
    });
    const late = createFakeTrack("audio");

    // Act
    const acquiring = media.acquire({ audio: "default", video: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    media.release();
    resolveMic(late);
    await acquiring;

    // Assert
    expect(media.microphone).toBeNull();
    expect(fakeTrackInfo(late).readyState).toBe("ended");
  });

  it("sees no change when a device stays unwanted", async () => {
    const { media } = setup();
    const changed = vi.fn();
    media.onChange(changed);

    await media.acquire({ audio: null, video: null });

    expect(changed).not.toHaveBeenCalled();
  });
});

describe("local media's voice gate", () => {
  it("creates the gate as configured and reports it running", async () => {
    const { env, media } = setup();

    const before = media.gateRunning;
    await media.acquire(BOTH);

    expect(before).toBe(false);
    expect(media.gateRunning).toBe(true);
    expect(env.captureContexts[0]?.gates[0]?.configs).toEqual([GATE]);
  });

  it("passes configuration and transitions through", async () => {
    const { env, media } = setup();
    const transitions = vi.fn();
    const off = media.onGate(transitions);
    const gating: GateConfig = { ...GATE, mode: "gate" };

    media.setGate(gating);
    await media.acquire(BOTH);
    const gate = env.captureContexts[0]?.gates[0];
    gate?.emit(true);
    off();
    gate?.emit(false);

    expect(gate?.configs).toEqual([gating]);
    expect(transitions.mock.calls).toEqual([[true]]);
  });

  it("tells about a gate that broke and reports the error", async () => {
    const env = createFakeMediaEnv();
    const errors: unknown[] = [];
    const media = create(env, errors);
    const changed = vi.fn();
    media.onChange(changed);
    await media.acquire(BOTH);
    changed.mockClear();

    const error = new Error("processorerror");
    env.captureContexts[0]?.gates[0]?.fail(error);

    expect(media.gateRunning).toBe(false);
    expect(changed).toHaveBeenCalled();
    expect(errors).toEqual([error]);
  });
});
