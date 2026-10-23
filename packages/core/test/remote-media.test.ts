import type { RemoteTrack, TrackSource } from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeTrack,
  createFakeVideoElement,
} from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import {
  createRemoteMedia,
  type PlaybackPolicy,
} from "../src/media/remote-media.ts";

interface Rules {
  deaf: boolean;
  refusedAudio: readonly string[];
  refusedVideo: readonly string[];
  volumes: Readonly<Record<string, number>>;
  sink: string;
}

function setup(rules: Partial<Rules> = {}) {
  const env = createFakeMediaEnv();
  let current: Rules = {
    deaf: false,
    refusedAudio: [],
    refusedVideo: [],
    volumes: {},
    sink: "default",
    ...rules,
  };
  const policy: PlaybackPolicy = {
    canHear: (p) => !current.deaf && !current.refusedAudio.includes(p),
    canSee: (p) => !current.refusedVideo.includes(p),
    volume: (p) => current.volumes[p] ?? 1,
    sinkId: () => current.sink,
  };
  const subscriptions =
    vi.fn<(p: string, s: TrackSource, on: boolean) => void>();
  const errors: unknown[] = [];
  const media = createRemoteMedia(env, policy, subscriptions, (e) =>
    errors.push(e),
  );
  return {
    env,
    media,
    subscriptions,
    errors,
    change: (next: Partial<Rules>) => {
      current = { ...current, ...next };
      media.refresh();
    },
  };
}

const remote = (participant: string, source: TrackSource): RemoteTrack => ({
  participant,
  source,
  track: createFakeTrack(
    source === "microphone" || source === "screen-audio" ? "audio" : "video",
  ),
});

describe("remote audio", () => {
  it("plays each remote microphone through its own output", () => {
    // Arrange
    const { env, media } = setup({ volumes: { p1: 0.4 } });
    const mic = remote("p1", "microphone");

    // Act
    media.add(mic);

    // Assert
    expect(env.outputs).toHaveLength(1);
    expect(env.outputs[0]?.state).toMatchObject({
      track: mic.track,
      volume: 0.4,
      sinkId: "default",
    });
    expect(media.has("p1", "audio")).toBe(true);
  });

  it("stops playing refused or deafened audio and resumes after", () => {
    const { env, media, change } = setup();
    const mic = remote("p1", "microphone");
    media.add(mic);

    change({ refusedAudio: ["p1"] });
    expect(env.outputs[0]?.state.track).toBeNull();
    expect(media.has("p1", "audio")).toBe(false);
    change({ refusedAudio: [], deaf: true });
    expect(env.outputs[0]?.state.track).toBeNull();
    change({ deaf: false, sink: "speakers", volumes: { p1: 0.2 } });
    expect(env.outputs[0]?.state).toMatchObject({
      track: mic.track,
      volume: 0.2,
      sinkId: "speakers",
    });
  });

  it("disposes the output when the track goes", () => {
    const { env, media } = setup();
    const mic = remote("p1", "microphone");
    media.add(mic);

    media.remove(remote("p1", "microphone"));
    expect(env.outputs[0]?.state.disposed).toBe(false);
    media.remove(mic);

    expect(env.outputs[0]?.state.disposed).toBe(true);
    expect(media.has("p1", "audio")).toBe(false);
  });

  it("reports a sink that fails to apply", async () => {
    // Arrange
    const env = createFakeMediaEnv();
    const errors: unknown[] = [];
    const failing = {
      ...env,
      createAudioOutput: () => ({
        ...env.createAudioOutput(),
        setSinkId: () => Promise.reject(new Error("no such device")),
      }),
    };
    const media = createRemoteMedia(
      failing,
      {
        canHear: () => true,
        canSee: () => true,
        volume: () => 1,
        sinkId: () => "gone",
      },
      () => undefined,
      (e) => errors.push(e),
    );

    // Act
    media.add(remote("p1", "microphone"));
    await Promise.resolve();

    // Assert
    expect(errors).toEqual([new Error("no such device")]);
  });
});

describe("remote video", () => {
  it("shows an attached camera, updates on arrival and clears when refused", () => {
    // Arrange
    const { env, media, change } = setup();
    const element = createFakeVideoElement();
    const cam = remote("p1", "camera");

    // Act / Assert
    media.attach("p1", "camera", element);
    expect(env.shownOn(element)).toEqual([]);
    media.add(cam);
    expect(env.shownOn(element)).toEqual([cam.track]);
    expect(media.videoStream("p1")?.getVideoTracks()).toEqual([cam.track]);
    change({ refusedVideo: ["p1"] });
    expect(env.shownOn(element)).toEqual([]);
    expect(media.videoStream("p1")).toBeNull();
    expect(media.has("p1", "video")).toBe(false);
  });

  it("detaches by itself when the element leaves its document", () => {
    const { env, media } = setup();
    const element = createFakeVideoElement();
    const cam = remote("p1", "camera");
    media.add(cam);
    media.attach("p1", "camera", element);

    env.removeElement(element);
    media.removeParticipant("p1");
    media.add(cam);

    expect(env.shownOn(element)).toEqual([]);
  });

  it("moves an element to the latest attachment and detaches on request", () => {
    // Arrange
    const { env, media } = setup();
    const element = createFakeVideoElement();
    const cam1 = remote("p1", "camera");
    const cam2 = remote("p2", "camera");
    media.add(cam1);
    media.add(cam2);

    // Act
    media.attach("p1", "camera", element);
    const detach = media.attach("p2", "camera", element);

    // Assert
    expect(env.shownOn(element)).toEqual([cam2.track]);
    detach();
    detach();
    expect(env.shownOn(element)).toEqual([]);
  });

  it("shows the local camera under the local id, never refused", () => {
    const { env, media, change } = setup();
    const element = createFakeVideoElement();
    const cam = createFakeTrack("video");
    media.attach("me", "camera", element);

    media.setLocalVideo("me", cam);
    change({ refusedVideo: ["me"] });

    expect(env.shownOn(element)).toEqual([cam]);
    expect(media.has("me", "video")).toBe(true);
    media.setLocalVideo("me", null);
    expect(env.shownOn(element)).toEqual([]);
  });

  it("reuses one stream per track", () => {
    const { media } = setup();
    media.add(remote("p1", "camera"));

    expect(media.videoStream("p1")).toBe(media.videoStream("p1"));
    expect(media.videoStream("nobody")).toBeNull();
  });
});

describe("subscriptions and changes", () => {
  it("tells the service only when a track's permission changes", () => {
    // Arrange
    const { media, subscriptions, change } = setup();

    // Act
    media.add(remote("p1", "microphone"));
    media.add(remote("p1", "camera"));
    change({ refusedVideo: ["p1"] });
    change({ refusedVideo: ["p1"] });

    // Assert
    expect(subscriptions.mock.calls).toEqual([
      ["p1", "microphone", true],
      ["p1", "camera", true],
      ["p1", "camera", false],
    ]);
  });

  it("notifies listeners until they unsubscribe, and clears everything", () => {
    const { env, media } = setup();
    const listener = vi.fn();
    const off = media.onChange(listener);

    media.add(remote("p1", "microphone"));
    media.setLocalVideo("me", createFakeTrack("video"));
    off();
    media.clear();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(env.outputs[0]?.state.disposed).toBe(true);
  });
});
