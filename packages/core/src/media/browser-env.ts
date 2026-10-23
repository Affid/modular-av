import type { AudioOutput, MediaEnv } from "./env.ts";

const deviceConstraint = (deviceId: string): MediaTrackConstraints =>
  deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {};

async function capture(
  kind: "audio" | "video",
  deviceId: string,
): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    [kind]: deviceConstraint(deviceId),
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

type Watched = ReadonlyMap<HTMLVideoElement, () => void>;

/** One observer per document, as the handoff asks, not one per element. */
function createRemovalWatcher(): MediaEnv["watchRemoval"] {
  let watched = new Map<Document, Watched>();
  let observers = new Map<Document, MutationObserver>();

  const check = (doc: Document): void => {
    const entries = watched.get(doc) ?? new Map<HTMLVideoElement, () => void>();
    const removed = [...entries].filter(([element]) => !element.isConnected);
    if (removed.length === 0) return;
    watched = new Map(watched).set(
      doc,
      new Map([...entries].filter(([element]) => element.isConnected)),
    );
    for (const [, onRemoved] of removed) onRemoved();
  };

  return (element, onRemoved) => {
    const doc = element.ownerDocument;
    if (!observers.has(doc)) {
      const observer = new MutationObserver(() => {
        check(doc);
      });
      observer.observe(doc, { childList: true, subtree: true });
      observers = new Map(observers).set(doc, observer);
    }
    const entries = watched.get(doc) ?? new Map<HTMLVideoElement, () => void>();
    watched = new Map(watched).set(
      doc,
      new Map(entries).set(element, onRemoved),
    );
    return () => {
      const current = new Map(watched.get(doc));
      current.delete(element);
      watched = new Map(watched).set(doc, current);
    };
  };
}

export function createBrowserMediaEnv(): MediaEnv {
  return {
    captureAudio: (deviceId) => capture("audio", deviceId),
    captureVideo: (deviceId) => capture("video", deviceId),
    createStream: (tracks) => new MediaStream([...tracks]),
    createAudioOutput: createElementOutput,
    showVideo(element, stream) {
      element.muted = true;
      if (element.srcObject !== stream) element.srcObject = stream;
    },
    watchRemoval: createRemovalWatcher(),
    onOnline(listener) {
      window.addEventListener("online", listener);
      return () => {
        window.removeEventListener("online", listener);
      };
    },
  };
}
