import type { DeviceKind, DeviceList } from "@modular-av/api";
import type { Booster, OutputState } from "./browser-boost.ts";
import { canWatchFrames, watchFrames } from "./browser-frames.ts";
import { createOnScreenWatcher } from "./browser-on-screen.ts";
import type { AudioOutput, MediaEnv } from "./env.ts";
import { resolutionConstraints } from "./video-resolution.ts";

const deviceConstraint = (deviceId: string): MediaTrackConstraints =>
  deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {};

async function capture(
  kind: "audio" | "video",
  deviceId: string,
  constraints: MediaTrackConstraints = {},
): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    [kind]: { ...deviceConstraint(deviceId), ...constraints },
  });
  const [track] =
    kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
  if (!track) throw new DOMException(`No ${kind} track`, "NotFoundError");
  return track;
}

/**
 * Remote WebRTC audio must reach an element in Chrome, even with Web Audio.
 * Above full volume the booster plays it (its code loads then) and the
 * element stays on, muted; until the booster runs, the element plays at full.
 */
function createElementOutput(): AudioOutput {
  const element = document.createElement("audio");
  element.autoplay = true;
  let state: OutputState = {
    ...{ track: null, volume: 1, muted: false, sinkId: "default" },
  };
  let booster: Booster | null = null;
  let loading = false;
  let disposed = false;
  const sync = (): void => {
    element.volume = Math.min(1, Math.max(0, state.volume));
    element.muted = (booster?.sync(state) ?? false) || state.muted;
    if (state.volume <= 1 || booster || loading || disposed) return;
    loading = true;
    import("./browser-boost.ts")
      .then(({ createBooster }) => {
        if (!disposed) booster = createBooster(sync);
        sync();
      })
      // Without it, the element plays at full volume.
      .catch(() => undefined)
      .finally(() => {
        loading = false;
      });
  };
  const change = (next: Partial<OutputState>): void => {
    state = { ...state, ...next };
    sync();
  };
  return {
    play(track) {
      element.srcObject = track ? new MediaStream([track]) : null;
      if (track) element.play().catch(() => undefined);
      change({ track });
    },
    setVolume: (volume) => {
      change({ volume });
    },
    setMuted: (muted) => {
      change({ muted });
    },
    async setSinkId(sinkId) {
      change({ sinkId });
      // Older Safari and Foundry's Electron app may lack output selection.
      if (!("setSinkId" in element)) return;
      await element.setSinkId(sinkId === "default" ? "" : sinkId);
    },
    dispose() {
      disposed = true;
      booster?.dispose();
      booster = null;
      element.srcObject = null;
    },
  };
}

type Watched = ReadonlyMap<Element, () => void>;

/**
 * One observer per document, as the handoff asks, not one per element. An
 * element moved to another document (the Picture-in-Picture window) is
 * watched there from then on, and back again; another window's document
 * is let go once nothing in it is watched.
 */
function createRemovalWatcher(): MediaEnv["watchRemoval"] {
  let watched = new Map<Document, Watched>();
  let observers = new Map<Document, MutationObserver>();

  const entriesOf = (doc: Document): Watched =>
    watched.get(doc) ?? new Map<Element, () => void>();

  const release = (doc: Document): void => {
    if (doc === document || entriesOf(doc).size > 0) return;
    observers.get(doc)?.disconnect();
    const lessObservers = new Map(observers);
    lessObservers.delete(doc);
    observers = lessObservers;
    const lessWatched = new Map(watched);
    lessWatched.delete(doc);
    watched = lessWatched;
  };

  const add = (element: Element, onRemoved: () => void): void => {
    const doc = element.ownerDocument;
    if (!observers.has(doc)) {
      const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new Observer(later);
      observer.observe(doc, { childList: true, subtree: true });
      observers = new Map(observers).set(doc, observer);
    }
    watched = new Map(watched).set(
      doc,
      new Map(entriesOf(doc)).set(element, onRemoved),
    );
  };

  /** Every watched element, wherever it went: removed, or moved. */
  function check(): void {
    for (const [doc, entries] of watched) {
      const stays = [...entries].filter(
        ([element]) => element.isConnected && element.ownerDocument === doc,
      );
      if (stays.length === entries.size) continue;
      watched = new Map(watched).set(doc, new Map(stays));
      for (const [element, onRemoved] of entries) {
        if (!element.isConnected) onRemoved();
        else if (element.ownerDocument !== doc) add(element, onRemoved);
      }
      release(doc);
    }
  }

  // Foundry's page changes all the time: one pass per task.
  let scheduled = false;
  function later(): void {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      check();
    });
  }

  return (element, onRemoved) => {
    add(element, onRemoved);
    return () => {
      for (const [doc, entries] of watched) {
        if (!entries.has(element)) continue;
        const current = new Map(entries);
        current.delete(element);
        watched = new Map(watched).set(doc, current);
        release(doc);
      }
    };
  };
}

const DEVICE_KINDS: Readonly<Record<MediaDeviceKind, DeviceKind>> = {
  audioinput: "audioInput",
  videoinput: "videoInput",
  audiooutput: "audioOutput",
};

/** Before any access is granted, browsers list devices without ids. */
async function listDevices(): Promise<DeviceList> {
  const found = await navigator.mediaDevices.enumerateDevices();
  const of = (kind: DeviceKind) =>
    found
      .filter((d) => d.deviceId !== "" && DEVICE_KINDS[d.kind] === kind)
      .map((d) => ({ id: d.deviceId, label: d.label }));
  return {
    audioInput: of("audioInput"),
    videoInput: of("videoInput"),
    audioOutput: of("audioOutput"),
  };
}

/** `assetUrl` resolves a file of the core's `public/` directory. */
export function createBrowserMediaEnv(
  assetUrl: (path: string) => string,
): MediaEnv {
  return {
    // Gain control stays on with a model: off, a quiet microphone is too quiet.
    captureAudio: (deviceId, { noiseSuppression = true } = {}) =>
      capture("audio", deviceId, { noiseSuppression }),
    captureVideo: (deviceId, { resolution = "default" } = {}) =>
      capture("video", deviceId, resolutionConstraints(resolution)),
    createStream: (tracks) => new MediaStream([...tracks]),
    createAudioOutput: createElementOutput,
    showVideo(element, stream) {
      element.muted = true;
      if (element.srcObject !== stream) element.srcObject = stream;
    },
    watchRemoval: createRemovalWatcher(),
    watchOnScreen: createOnScreenWatcher(),
    onOnline(listener) {
      window.addEventListener("online", listener);
      return () => {
        window.removeEventListener("online", listener);
      };
    },
    canWatchFrames,
    watchFrames,
    listDevices,
    onDeviceChange(listener) {
      navigator.mediaDevices.addEventListener("devicechange", listener);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", listener);
      };
    },
    // Only needed once someone shows another player's meter.
    async createLevelMeter(track) {
      const { createBrowserLevelMeter } = await import("./browser-meters.ts");
      return createBrowserLevelMeter(track);
    },
    every(element, ms, run) {
      const view = element.ownerDocument.defaultView ?? window;
      const timer = view.setInterval(run, ms);
      return () => {
        view.clearInterval(timer);
      };
    },
    // Only needed once a microphone is captured: kept out of the entry.
    async createCaptureContext() {
      const { createBrowserCaptureContext } =
        await import("./browser-capture.ts");
      return createBrowserCaptureContext(assetUrl);
    },
    createAudioEffectHost: (context, options) => async (kernel) => {
      const { createAudioEffectHost } = await import("./effect-host.ts");
      return createAudioEffectHost(context, assetUrl, options)(kernel);
    },
  };
}
