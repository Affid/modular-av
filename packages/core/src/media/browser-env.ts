import type { DeviceKind, DeviceList } from "@modular-av/api";
import { canWatchFrames, watchFrames } from "./browser-frames.ts";
import { createOnScreenWatcher } from "./browser-on-screen.ts";
import type { AudioOutput, MediaEnv } from "./env.ts";

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

/** Remote WebRTC audio must reach an element in Chrome, even with Web Audio. */
function createElementOutput(): AudioOutput {
  const element = document.createElement("audio");
  element.autoplay = true;
  return {
    play(track) {
      element.srcObject = track ? new MediaStream([track]) : null;
      if (track) element.play().catch(() => undefined);
    },
    setVolume(volume) {
      element.volume = Math.min(1, Math.max(0, volume));
    },
    setMuted(muted) {
      element.muted = muted;
    },
    async setSinkId(sinkId) {
      // Older Safari and Foundry's Electron app may lack output selection.
      if (!("setSinkId" in element)) return;
      await element.setSinkId(sinkId === "default" ? "" : sinkId);
    },
    dispose() {
      element.srcObject = null;
    },
  };
}

type Watched = ReadonlyMap<Element, () => void>;

/**
 * One observer per document, as the handoff asks, not one per element. An
 * element moved to another document (the Picture-in-Picture window) is
 * watched there from then on.
 */
function createRemovalWatcher(): MediaEnv["watchRemoval"] {
  let watched = new Map<Document, Watched>();
  let observers = new Map<Document, MutationObserver>();

  const entriesOf = (doc: Document): Watched =>
    watched.get(doc) ?? new Map<Element, () => void>();

  const add = (element: Element, onRemoved: () => void): void => {
    const doc = element.ownerDocument;
    if (!observers.has(doc)) {
      const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new Observer(() => {
        check(doc);
      });
      observer.observe(doc, { childList: true, subtree: true });
      observers = new Map(observers).set(doc, observer);
    }
    watched = new Map(watched).set(
      doc,
      new Map(entriesOf(doc)).set(element, onRemoved),
    );
  };

  function check(doc: Document): void {
    const entries = [...entriesOf(doc)];
    const stays = entries.filter(
      ([element]) => element.isConnected && element.ownerDocument === doc,
    );
    if (stays.length === entries.length) return;
    watched = new Map(watched).set(doc, new Map(stays));
    for (const [element, onRemoved] of entries) {
      if (!element.isConnected) onRemoved();
      else if (element.ownerDocument !== doc) add(element, onRemoved);
    }
  }

  return (element, onRemoved) => {
    add(element, onRemoved);
    return () => {
      for (const [doc, entries] of watched) {
        if (!entries.has(element)) continue;
        const current = new Map(entries);
        current.delete(element);
        watched = new Map(watched).set(doc, current);
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
    captureAudio: (deviceId, options = {}) =>
      capture("audio", deviceId, {
        noiseSuppression: options.noiseSuppression ?? true,
      }),
    captureVideo: (deviceId) => capture("video", deviceId),
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
  };
}
