import {
  createFakeMediaEnv,
  endFakeTrack,
  fakeTrackInfo,
  type FakeDisplayCapture,
} from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import { createScreenShare } from "../src/media/screen-share.ts";

describe("the shared screen", () => {
  it("keeps the picture when only the sound ends", async () => {
    // Arrange
    const env = createFakeMediaEnv();
    const share = createScreenShare(env);
    const changed = vi.fn();
    share.onChange(changed);
    await share.start(true);
    const sound = share.audio;

    // Act
    if (sound) endFakeTrack(sound);

    // Assert
    expect(share.video).not.toBeNull();
    expect(share.audio).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("ends when the sound ends first and the picture after it", async () => {
    // Arrange: the browser's "Stop sharing" ends both tracks, in any order.
    const share = createScreenShare(createFakeMediaEnv());
    const changed = vi.fn();
    await share.start(true);
    share.onChange(changed);
    const { video, audio } = share;

    // Act
    if (audio) endFakeTrack(audio);
    if (video) endFakeTrack(video);

    // Assert
    expect(share.video).toBeNull();
    expect(share.audio).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("stops only the sound when asked, and keeps the picture", async () => {
    // Arrange
    const share = createScreenShare(createFakeMediaEnv());
    const changed = vi.fn();
    await share.start(true);
    share.onChange(changed);
    const sound = share.audio;

    // Act
    share.stopAudio();
    share.stopAudio();

    // Assert
    expect(sound && fakeTrackInfo(sound).readyState).toBe("ended");
    expect(share.audio).toBeNull();
    expect(share.video).not.toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("drops a pick that comes back after the share was stopped", async () => {
    // Arrange: the picker is still open when the player stops.
    let resolve: (capture: FakeDisplayCapture) => void = () => undefined;
    const env = createFakeMediaEnv();
    const share = createScreenShare({
      captureDisplay: () =>
        new Promise<FakeDisplayCapture>((r) => {
          resolve = r;
        }),
    });
    const starting = share.start(false);
    const late = await env.captureDisplay({ audio: true });

    // Act
    share.stop();
    resolve(late);
    await starting;

    // Assert
    expect(share.video).toBeNull();
    expect(fakeTrackInfo(late.video).readyState).toBe("ended");
    expect(late.audio && fakeTrackInfo(late.audio).readyState).toBe("ended");
  });

  it("stops telling a listener that unsubscribed", async () => {
    const share = createScreenShare(createFakeMediaEnv());
    const changed = vi.fn();
    const off = share.onChange(changed);

    off();
    await share.start(false);

    expect(changed).not.toHaveBeenCalled();
  });

  it("ignores the end of a share it already replaced", async () => {
    const share = createScreenShare(createFakeMediaEnv());
    await share.start(true);
    const first = { video: share.video, audio: share.audio };
    await share.start(true);
    const current = share.video;

    if (first.video) endFakeTrack(first.video);
    if (first.audio) endFakeTrack(first.audio);

    expect(share.video).toBe(current);
    expect(share.audio).not.toBeNull();
  });
});
