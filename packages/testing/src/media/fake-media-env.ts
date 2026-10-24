import type { DeviceList } from "@modular-av/api";
import { createFakeTrack } from "../service/fake-track.ts";
import {
  createFakeCaptureContext,
  type FakeCaptureContext,
} from "./fake-audio.ts";

/**
 * A stand-in for the core's `MediaEnv` (packages/core/src/media/env.ts),
 * declared structurally so this package doesn't depend on the core.
 */
export interface FakeAudioOutputState {
  readonly track: MediaStreamTrack | null;
  readonly volume: number;
  readonly muted: boolean;
  readonly sinkId: string;
  readonly disposed: boolean;
}

export interface FakeAudioOutput {
  play(track: MediaStreamTrack | null): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setSinkId(sinkId: string): Promise<void>;
  dispose(): void;
  readonly state: FakeAudioOutputState;
}

export interface FakeMediaEnvOptions {
  /** DOMException names to reject captures with, per kind. */
  readonly deny?: { readonly audio?: string; readonly video?: string };
  /** Whether frames can be watched (MediaStreamTrackProcessor); default true. */
  readonly watchFrames?: boolean;
  /** What `listDevices` reports; one default device of each kind if absent. */
  readonly devices?: DeviceList;
}

export const FAKE_DEVICES: DeviceList = {
  audioInput: [{ id: "default", label: "Fake microphone" }],
  videoInput: [{ id: "default", label: "Fake camera" }],
  audioOutput: [{ id: "default", label: "Fake speakers" }],
};

export interface FakeAudioCapture {
  readonly deviceId: string;
  readonly noiseSuppression: boolean;
}

export interface FakeMediaEnv {
  captureAudio(
    deviceId: string,
    options?: { readonly noiseSuppression?: boolean },
  ): Promise<MediaStreamTrack>;
  captureVideo(deviceId: string): Promise<MediaStreamTrack>;
  createStream(tracks: readonly MediaStreamTrack[]): MediaStream;
  createAudioOutput(): FakeAudioOutput;
  showVideo(element: HTMLVideoElement, stream: MediaStream | null): void;
  watchRemoval(element: HTMLVideoElement, onRemoved: () => void): () => void;
  onOnline(listener: () => void): () => void;
  createCaptureContext(): Promise<FakeCaptureContext>;
  canWatchFrames(): boolean;
  listDevices(): Promise<DeviceList>;
  onDeviceChange(listener: () => void): () => void;
  watchFrames(track: MediaStreamTrack, onFrame: () => void): () => void;

  /** Every capture context created, in order. */
  readonly captureContexts: readonly FakeCaptureContext[];
  /** Device ids captured, in order, as `"audio:<id>"` / `"video:<id>"`. */
  readonly captures: readonly string[];
  /** Each microphone capture asked for, with its processing options. */
  readonly audioCaptures: readonly FakeAudioCapture[];
  readonly outputs: readonly FakeAudioOutput[];
  /** The tracks an element currently shows. */
  shownOn(element: HTMLVideoElement): readonly MediaStreamTrack[];
  /** Plays the browser removing an element from its document. */
  removeElement(element: HTMLVideoElement): void;
  goOnline(): void;
  setDenied(kind: "audio" | "video", name: string | undefined): void;
  /** Captures of this device fail with NotFoundError while unplugged. */
  setUnplugged(kind: "audio" | "video", deviceId: string, out: boolean): void;
  /** Plays a frame arriving on a watched track. */
  frame(track: MediaStreamTrack | undefined): void;
  watching(track: MediaStreamTrack | undefined): boolean;
  /** Plays devices being plugged in or out: the list, then `devicechange`. */
  setDevices(devices: DeviceList): void;
}

let nextStream = 1;

function createFakeStream(tracks: readonly MediaStreamTrack[]): MediaStream {
  const all = [...tracks];
  return {
    id: `fake-stream-${String(nextStream++)}`,
    getTracks: () => [...all],
    getAudioTracks: () => all.filter((t) => t.kind === "audio"),
    getVideoTracks: () => all.filter((t) => t.kind === "video"),
  } as unknown as MediaStream;
}

function createOutput(): FakeAudioOutput {
  let state: FakeAudioOutputState = {
    track: null,
    volume: 1,
    muted: false,
    sinkId: "",
    disposed: false,
  };
  return {
    play(track) {
      state = { ...state, track };
    },
    setVolume(volume) {
      state = { ...state, volume };
    },
    setMuted(muted) {
      state = { ...state, muted };
    },
    setSinkId(sinkId) {
      state = { ...state, sinkId };
      return Promise.resolve();
    },
    dispose() {
      state = { ...state, track: null, disposed: true };
    },
    get state() {
      return state;
    },
  };
}

export function createFakeMediaEnv(
  options: FakeMediaEnvOptions = {},
): FakeMediaEnv {
  let deny = { ...options.deny };
  let unplugged: ReadonlySet<string> = new Set();
  let captures: readonly string[] = [];
  let audioCaptures: readonly FakeAudioCapture[] = [];
  let outputs: readonly FakeAudioOutput[] = [];
  let shown = new Map<HTMLVideoElement, MediaStream | null>();
  let removalWatchers = new Map<HTMLVideoElement, readonly (() => void)[]>();
  let onlineListeners: readonly (() => void)[] = [];
  let captureContexts: readonly FakeCaptureContext[] = [];
  let devices = options.devices ?? FAKE_DEVICES;
  let deviceListeners: readonly (() => void)[] = [];
  let frameWatchers: readonly {
    readonly track: MediaStreamTrack;
    readonly onFrame: () => void;
  }[] = [];

  const capture = (
    kind: "audio" | "video",
    deviceId: string,
  ): Promise<MediaStreamTrack> => {
    captures = [...captures, `${kind}:${deviceId}`];
    const denied = deny[kind];
    if (denied) return Promise.reject(new DOMException("Denied", denied));
    if (unplugged.has(`${kind}:${deviceId}`))
      return Promise.reject(new DOMException("Unplugged", "NotFoundError"));
    return Promise.resolve(createFakeTrack(kind, `${kind} ${deviceId}`));
  };

  return {
    captureAudio(deviceId, captureOptions = {}) {
      audioCaptures = [
        ...audioCaptures,
        {
          deviceId,
          noiseSuppression: captureOptions.noiseSuppression ?? true,
        },
      ];
      return capture("audio", deviceId);
    },
    captureVideo: (deviceId) => capture("video", deviceId),
    createStream: createFakeStream,
    createAudioOutput() {
      const output = createOutput();
      outputs = [...outputs, output];
      return output;
    },
    showVideo(element, stream) {
      shown = new Map(shown).set(element, stream);
    },
    watchRemoval(element, onRemoved) {
      removalWatchers = new Map(removalWatchers).set(element, [
        ...(removalWatchers.get(element) ?? []),
        onRemoved,
      ]);
      return () => {
        removalWatchers = new Map(removalWatchers).set(
          element,
          (removalWatchers.get(element) ?? []).filter((w) => w !== onRemoved),
        );
      };
    },
    onOnline(listener) {
      onlineListeners = [...onlineListeners, listener];
      return () => {
        onlineListeners = onlineListeners.filter((l) => l !== listener);
      };
    },
    createCaptureContext() {
      const context = createFakeCaptureContext();
      captureContexts = [...captureContexts, context];
      return Promise.resolve(context);
    },
    get captureContexts() {
      return captureContexts;
    },
    canWatchFrames: () => options.watchFrames ?? true,
    listDevices: () => Promise.resolve(devices),
    onDeviceChange(listener) {
      deviceListeners = [...deviceListeners, listener];
      return () => {
        deviceListeners = deviceListeners.filter((l) => l !== listener);
      };
    },
    setDevices(next) {
      devices = next;
      for (const listener of deviceListeners) listener();
    },
    watchFrames(track, onFrame) {
      const watcher = { track, onFrame };
      frameWatchers = [...frameWatchers, watcher];
      return () => {
        frameWatchers = frameWatchers.filter((w) => w !== watcher);
      };
    },
    frame(track) {
      for (const w of frameWatchers) if (w.track === track) w.onFrame();
    },
    watching: (track) => frameWatchers.some((w) => w.track === track),
    get captures() {
      return captures;
    },
    get audioCaptures() {
      return audioCaptures;
    },
    get outputs() {
      return outputs;
    },
    shownOn: (element) => shown.get(element)?.getTracks() ?? [],
    removeElement(element) {
      const watchers = removalWatchers.get(element) ?? [];
      const next = new Map(removalWatchers);
      next.delete(element);
      removalWatchers = next;
      for (const onRemoved of watchers) onRemoved();
    },
    goOnline() {
      for (const listener of onlineListeners) listener();
    },
    setDenied(kind, name) {
      deny = { ...deny, [kind]: name };
    },
    setUnplugged(kind, deviceId, out) {
      const id = `${kind}:${deviceId}`;
      unplugged = out
        ? new Set([...unplugged, id])
        : new Set([...unplugged].filter((x) => x !== id));
    },
  };
}

/** Video elements are only compared by identity in unit tests. */
export function createFakeVideoElement(): HTMLVideoElement {
  return {} as HTMLVideoElement;
}
