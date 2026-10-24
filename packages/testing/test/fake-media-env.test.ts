import { describe, expect, it, vi } from "vitest";
import {
  createFakeMediaEnv,
  createFakeVideoElement,
} from "../src/media/fake-media-env.ts";
import { createFakeTrack } from "../src/service/fake-track.ts";

const createFakeVideoTrack = (): MediaStreamTrack => createFakeTrack("video");

describe("fake media environment", () => {
  it("captures fake tracks and records the devices asked for", async () => {
    // Arrange
    const env = createFakeMediaEnv();

    // Act
    const mic = await env.captureAudio("default");
    const cam = await env.captureVideo("cam-2");

    // Assert
    expect([mic.kind, cam.kind]).toEqual(["audio", "video"]);
    expect(env.captures).toEqual(["audio:default", "video:cam-2"]);
  });

  it("rejects captures the way getUserMedia does when denied", async () => {
    const env = createFakeMediaEnv({ deny: { video: "NotAllowedError" } });

    await expect(env.captureVideo("default")).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    env.setDenied("video", undefined);
    await expect(env.captureVideo("default")).resolves.toBeDefined();
  });

  it("builds streams that split tracks by kind", async () => {
    const env = createFakeMediaEnv();
    const mic = await env.captureAudio("default");
    const cam = await env.captureVideo("default");

    const stream = env.createStream([mic, cam]);

    expect(stream.getAudioTracks()).toEqual([mic]);
    expect(stream.getVideoTracks()).toEqual([cam]);
    expect(stream.getTracks()).toHaveLength(2);
  });

  it("records audio outputs' state", async () => {
    // Arrange
    const env = createFakeMediaEnv();
    const output = env.createAudioOutput();
    const mic = await env.captureAudio("default");

    // Act
    output.play(mic);
    output.setVolume(0.5);
    output.setMuted(true);
    await output.setSinkId("speakers");

    // Assert
    expect(env.outputs[0]?.state).toEqual({
      track: mic,
      volume: 0.5,
      muted: true,
      sinkId: "speakers",
      disposed: false,
    });
    output.dispose();
    expect(output.state).toMatchObject({ track: null, disposed: true });
  });

  it("shows streams on elements and reports removal", async () => {
    // Arrange
    const env = createFakeMediaEnv();
    const element = createFakeVideoElement();
    const cam = await env.captureVideo("default");
    const removed = vi.fn();
    const unwatched = vi.fn();

    // Act
    env.showVideo(element, env.createStream([cam]));
    env.watchRemoval(element, removed);
    env.watchRemoval(element, unwatched)();
    env.removeElement(element);
    env.removeElement(element);

    // Assert
    expect(env.shownOn(element)).toEqual([cam]);
    expect(env.shownOn(createFakeVideoElement())).toEqual([]);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(unwatched).not.toHaveBeenCalled();
  });

  it("tells online listeners until they unsubscribe", () => {
    const env = createFakeMediaEnv();
    const listener = vi.fn();
    const off = env.onOnline(listener);

    env.goOnline();
    off();
    env.goOnline();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("delivers frames to the watchers of a track until they stop", () => {
    const env = createFakeMediaEnv();
    const track = createFakeVideoTrack();
    const frames = vi.fn();

    const stop = env.watchFrames(track, frames);
    env.frame(track);
    env.frame(undefined);
    const watched = env.watching(track);
    stop();
    env.frame(track);

    expect(frames).toHaveBeenCalledTimes(1);
    expect(watched).toBe(true);
    expect(env.watching(track)).toBe(false);
    expect(env.canWatchFrames()).toBe(true);
    expect(createFakeMediaEnv({ watchFrames: false }).canWatchFrames()).toBe(
      false,
    );
  });

  it("lists devices and tells about changes until unsubscribed", async () => {
    const env = createFakeMediaEnv();
    const changes = vi.fn();
    const off = env.onDeviceChange(changes);
    const usb = {
      audioInput: [{ id: "usb", label: "USB microphone" }],
      videoInput: [],
      audioOutput: [],
    };

    const before = await env.listDevices();
    env.setDevices(usb);
    off();
    env.setDevices(usb);

    expect(before.audioInput).toEqual([
      { id: "default", label: "Fake microphone" },
    ]);
    expect(await env.listDevices()).toBe(usb);
    expect(changes).toHaveBeenCalledTimes(1);
  });
});
