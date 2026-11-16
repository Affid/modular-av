import type {
  AudioSource,
  MediaAttachment,
  ParticipantId,
} from "@modular-av/api";
import type { RemoteMedia } from "./remote-media.ts";

const AUDIO_SOURCES: readonly unknown[] = ["microphone", "screen"];

/** Where sounds come from, known once Foundry's `setup` made the call. */
export interface AudioSources {
  /** What this client plays of another, or what the local player sends. */
  track(
    participant: ParticipantId,
    source: AudioSource,
  ): MediaStreamTrack | null;
  /** Some track, permission or mute changed. */
  onChange(listener: () => void): () => void;
}

/** The parts of the call that hold sounds. */
export interface CallSounds {
  readonly selfId: ParticipantId;
  /** Its `enabled` is the mute. */
  readonly local: { readonly microphone: MediaStreamTrack | null };
  readonly screen: { readonly audio: MediaStreamTrack | null };
  readonly remote: Pick<RemoteMedia, "audioTrack" | "onChange">;
}

export interface AudioCopiesDeps {
  /** Installed and enabled in this world. */
  readonly isActiveModule: (moduleId: string) => boolean;
  readonly onError: (error: unknown) => void;
}

export interface CoreAudioCopies {
  readonly audio: MediaAttachment["audio"];
  /** Subscriptions made before this wait for it. */
  start(sources: AudioSources): void;
}

interface Subscription {
  /** Kept for telling the players which modules receive voices. */
  readonly moduleId: string;
  readonly participant: ParticipantId;
  readonly source: AudioSource;
  readonly listener: (track: MediaStreamTrack | null) => void;
  /** The track copied, and the copy handed out. */
  readonly from: MediaStreamTrack | null;
  readonly copy: MediaStreamTrack | null;
}

/** Others' sound as this client plays it; the local player's as sent. */
export function callSources(call: CallSounds): AudioSources {
  return {
    track(participant, source) {
      if (participant !== call.selfId)
        return call.remote.audioTrack(
          participant,
          source === "screen" ? "screen-audio" : "microphone",
        );
      if (source === "screen") return call.screen.audio;
      const microphone = call.local.microphone;
      return microphone?.enabled ? microphone : null;
    },
    onChange: (listener) => call.remote.onChange(listener),
  };
}

function validate(
  deps: AudioCopiesDeps,
  moduleId: unknown,
  source: unknown,
  listener: unknown,
): void {
  if (typeof moduleId !== "string" || !deps.isActiveModule(moduleId))
    throw new Error(`"${String(moduleId)}" is not an active module`);
  if (!AUDIO_SOURCES.includes(source))
    throw new Error(`Unknown audio source "${String(source)}"`);
  if (typeof listener !== "function")
    throw new TypeError("The listener must be a function");
}

export function createAudioCopies(deps: AudioCopiesDeps): CoreAudioCopies {
  let sources: AudioSources | null = null;
  let subscriptions: ReadonlyMap<object, Subscription> = new Map();

  const deliver = (key: object, copy: MediaStreamTrack | null): void => {
    const sub = subscriptions.get(key);
    // Its listener may have ended it, or another one, meanwhile.
    if (sub?.copy !== copy) return;
    try {
      sub.listener(copy);
    } catch (error: unknown) {
      deps.onError(error);
    }
  };

  /** An ended track has nothing to copy; a failed copy is none. */
  const copyOf = (from: MediaStreamTrack | null): MediaStreamTrack | null => {
    if (from?.readyState !== "live") return null;
    try {
      return from.clone();
    } catch (error: unknown) {
      deps.onError(error);
      return null;
    }
  };

  /** Copies what changed, then tells: a listener may subscribe or end. */
  const sync = (): void => {
    if (!sources) return;
    const next = new Map(subscriptions);
    const changed: {
      readonly key: object;
      readonly copy: MediaStreamTrack | null;
    }[] = [];
    for (const [key, sub] of subscriptions) {
      const from = sources.track(sub.participant, sub.source);
      if (from === sub.from) continue;
      const copy = copyOf(from);
      sub.copy?.stop();
      next.set(key, { ...sub, from, copy });
      // Null after null is no news.
      if (copy !== sub.copy) changed.push({ key, copy });
    }
    subscriptions = next;
    for (const { key, copy } of changed) deliver(key, copy);
  };

  const audio: MediaAttachment["audio"] = (
    moduleId,
    participant,
    source,
    listener,
  ) => {
    validate(deps, moduleId, source, listener);
    const key = {};
    const sub: Subscription = {
      ...{ moduleId, participant, source, listener },
      ...{ from: null, copy: null },
    };
    subscriptions = new Map(subscriptions).set(key, sub);
    queueMicrotask(sync);
    return () => {
      const current = subscriptions.get(key);
      if (!current) return;
      current.copy?.stop();
      const next = new Map(subscriptions);
      next.delete(key);
      subscriptions = next;
    };
  };

  return {
    audio,
    start(next) {
      sources = next;
      next.onChange(sync);
      sync();
    },
  };
}
