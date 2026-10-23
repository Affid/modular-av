import {
  createFakeMediaEnv,
  createFakeTrack,
  fakeTrackInfo,
} from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import { createLocalMedia } from "../src/media/local-media.ts";

const BOTH = { audio: "default", video: "default" } as const;

function setup(options?: Parameters<typeof createFakeMediaEnv>[0]) {
  const env = createFakeMediaEnv(options);
  return { env, media: createLocalMedia(env) };
}

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

  it("keeps the levels stream live while the sent microphone is muted", async () => {
    const { media } = setup();

    await media.acquire(BOTH);

    const [raw] = media.levelsStream?.getAudioTracks() ?? [];
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
    expect(media.camera).toBe(oldCam);
    expect(media.microphone).not.toBe(oldMic);
    expect(oldMic && fakeTrackInfo(oldMic).readyState).toBe("ended");
    expect(changed).toHaveBeenCalledTimes(1);
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
    const { media } = setup();
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
    expect([media.microphone, media.levelsStream]).toEqual([null, null]);
    media.release();
    expect(changed).toHaveBeenCalledTimes(2);
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
    const media = createLocalMedia({
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
    const media = createLocalMedia({
      ...env,
      createStream: (tracks) => {
        if (fail) throw new Error("no streams");
        return env.createStream(tracks);
      },
    });

    // Act / Assert
    await expect(media.acquire(BOTH)).rejects.toThrow(/no streams/);
    fail = false;
    await media.acquire({ audio: "headset", video: "default" });
    expect(media.levelsStream).not.toBeNull();
  });

  it("stops tracks a capture returns after release", async () => {
    // Arrange
    const env = createFakeMediaEnv();
    let resolveMic: (track: MediaStreamTrack) => void = () => undefined;
    const media = createLocalMedia({
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
