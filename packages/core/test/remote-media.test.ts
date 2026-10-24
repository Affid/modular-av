import type {
  RemoteTrack,
  SubscriptionOptions,
  TrackSource,
} from "@modular-av/api";
import {
  createFakeMediaEnv,
  createFakeTrack,
  createFakeVideoElement,
} from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFF_SCREEN_GRACE_MS } from "../src/media/on-screen.ts";
import {
  createRemoteMedia,
  type PlaybackPolicy,
} from "../src/media/remote-media.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

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
    vi.fn<(p: string, s: TrackSource, options: SubscriptionOptions) => void>();
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
      ["p1", "microphone", { enabled: true }],
      ["p1", "camera", { enabled: true }],
      ["p1", "camera", { enabled: false }],
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

describe("videos nobody can see", () => {
  const ON = { visible: true, height: 360 };
  const OFF = { visible: false, height: 360 };

  it("pause a while after leaving the screen, and resume at once", () => {
    // Arrange
    const { env, media, subscriptions } = setup();
    const element = createFakeVideoElement();
    media.add(remote("p1", "camera"));
    media.attach("p1", "camera", element);
    env.setOnScreen(element, ON);
    subscriptions.mockClear();

    // Act
    env.setOnScreen(element, OFF);
    vi.advanceTimersByTime(OFF_SCREEN_GRACE_MS - 1);
    const early = subscriptions.mock.calls.length;
    vi.advanceTimersByTime(1);

    // Assert
    expect(early).toBe(0);
    expect(subscriptions.mock.calls).toEqual([
      ["p1", "camera", { enabled: false }],
    ]);
    env.setOnScreen(element, ON);
    expect(subscriptions.mock.calls.at(-1)).toEqual([
      "p1",
      "camera",
      { enabled: true, maxQuality: "medium" },
    ]);
  });

  it("don't pause for a moment off screen", () => {
    const { env, media, subscriptions } = setup();
    const element = createFakeVideoElement();
    media.add(remote("p1", "camera"));
    media.attach("p1", "camera", element);
    env.setOnScreen(element, ON);
    subscriptions.mockClear();

    env.setOnScreen(element, OFF);
    vi.advanceTimersByTime(OFF_SCREEN_GRACE_MS / 2);
    env.setOnScreen(element, ON);
    vi.advanceTimersByTime(OFF_SCREEN_GRACE_MS);

    expect(subscriptions).not.toHaveBeenCalled();
  });

  it("pause when shown nowhere, and resume once shown", () => {
    const { env, media, subscriptions } = setup();
    media.add(remote("p1", "camera"));
    vi.advanceTimersByTime(OFF_SCREEN_GRACE_MS);
    expect(subscriptions.mock.calls.at(-1)?.[2]).toEqual({ enabled: false });

    const element = createFakeVideoElement();
    media.attach("p1", "camera", element);

    expect(subscriptions.mock.calls.at(-1)?.[2]).toEqual({ enabled: true });
    env.setOnScreen(element, { visible: true, height: 1080 });
    expect(subscriptions.mock.calls.at(-1)?.[2]).toEqual({
      enabled: true,
      maxQuality: "high",
    });
  });

  it("ask for the quality the largest element on screen needs", () => {
    const { env, media, subscriptions } = setup();
    const small = createFakeVideoElement();
    const large = createFakeVideoElement();
    media.add(remote("p1", "camera"));
    media.attach("p1", "camera", small);
    env.setOnScreen(small, { visible: true, height: 180 });
    expect(subscriptions.mock.calls.at(-1)?.[2]).toEqual({
      enabled: true,
      maxQuality: "low",
    });

    media.attach("p1", "camera", large);
    env.setOnScreen(large, { visible: true, height: 720 });
    expect(subscriptions.mock.calls.at(-1)?.[2]).toEqual({
      enabled: true,
      maxQuality: "high",
    });
    env.setOnScreen(large, { visible: false, height: 720 });
    expect(subscriptions.mock.calls.at(-1)?.[2]).toEqual({
      enabled: true,
      maxQuality: "low",
    });
  });

  it("stay refused when allowed on screen but not by the rules", () => {
    const { env, media, subscriptions } = setup({ refusedVideo: ["p1"] });
    const element = createFakeVideoElement();
    media.add(remote("p1", "camera"));
    media.attach("p1", "camera", element);

    env.setOnScreen(element, ON);

    expect(subscriptions.mock.calls.map((c) => c[2].enabled)).toEqual([false]);
  });

  it("leave audio alone", () => {
    const { media, subscriptions } = setup();
    media.add(remote("p1", "microphone"));

    vi.advanceTimersByTime(OFF_SCREEN_GRACE_MS * 2);

    expect(subscriptions.mock.calls).toEqual([
      ["p1", "microphone", { enabled: true }],
    ]);
  });
});
