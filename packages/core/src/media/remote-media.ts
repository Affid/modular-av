import type {
  ParticipantId,
  RemoteTrack,
  TrackSource,
  VideoSource,
} from "@modular-av/api";
import type { AudioOutput, MediaEnv } from "./env.ts";

/**
 * What this client agrees to play. The core enforces GM blocks here too,
 * which is the only enforcement a server-less service (P2P) has.
 */
export interface PlaybackPolicy {
  canHear(participant: ParticipantId): boolean;
  canSee(participant: ParticipantId): boolean;
  volume(participant: ParticipantId): number;
  sinkId(): string;
}

export interface RemoteMedia {
  add(track: RemoteTrack): void;
  remove(track: RemoteTrack): void;
  removeParticipant(participant: ParticipantId): void;
  clear(): void;
  /** Re-reads the policy: call after anything it depends on changed. */
  refresh(): void;
  /** The local camera, shown under the local participant's id. */
  setLocalVideo(
    participant: ParticipantId,
    track: MediaStreamTrack | null,
  ): void;
  attach(
    participant: ParticipantId,
    source: VideoSource,
    element: HTMLVideoElement,
  ): () => void;
  /** A video-only stream of what this client may show, for Foundry's dock. */
  videoStream(participant: ParticipantId): MediaStream | null;
  /** Present and allowed. */
  has(participant: ParticipantId, kind: "audio" | "video"): boolean;
  /** Presence or permission of some track changed. */
  onChange(listener: () => void): () => void;
}

/** Tells the service which tracks to receive at all. */
export type SetSubscription = (
  participant: ParticipantId,
  source: TrackSource,
  enabled: boolean,
) => void;

const AUDIO_SOURCES: readonly TrackSource[] = ["microphone", "screen-audio"];

const key = (participant: ParticipantId, source: TrackSource): string =>
  `${participant}|${source}`;

interface Attachment {
  readonly participant: ParticipantId;
  readonly source: VideoSource;
  readonly element: HTMLVideoElement;
  readonly unwatch: () => void;
}

interface Playing {
  readonly output: AudioOutput;
  readonly track: MediaStreamTrack | null;
  readonly sinkId: string | null;
}

export function createRemoteMedia(
  env: MediaEnv,
  policy: PlaybackPolicy,
  setSubscription: SetSubscription,
  onError: (error: unknown) => void,
): RemoteMedia {
  let tracks = new Map<string, RemoteTrack>();
  let local: { participant: ParticipantId; track: MediaStreamTrack } | null =
    null;
  let playing = new Map<string, Playing>();
  let attachments: readonly Attachment[] = [];
  const streams = new WeakMap<MediaStreamTrack, MediaStream>();
  let subscribed = new Map<string, boolean>();
  let listeners: readonly { readonly listener: () => void }[] = [];

  const streamOf = (track: MediaStreamTrack): MediaStream => {
    const cached = streams.get(track);
    if (cached) return cached;
    const stream = env.createStream([track]);
    streams.set(track, stream);
    return stream;
  };

  const videoTrack = (
    participant: ParticipantId,
    source: VideoSource,
  ): MediaStreamTrack | null => {
    if (local?.participant === participant)
      return source === "camera" ? local.track : null;
    if (!policy.canSee(participant)) return null;
    return tracks.get(key(participant, source))?.track ?? null;
  };

  const syncAudio = (): void => {
    const next = new Map<string, Playing>();
    for (const [id, remote] of tracks) {
      if (!AUDIO_SOURCES.includes(remote.source)) continue;
      const current = playing.get(id) ?? {
        output: env.createAudioOutput(),
        track: null,
        sinkId: null,
      };
      const track = policy.canHear(remote.participant) ? remote.track : null;
      if (current.track !== track) current.output.play(track);
      current.output.setVolume(policy.volume(remote.participant));
      const sinkId = policy.sinkId();
      if (current.sinkId !== sinkId)
        current.output.setSinkId(sinkId).catch(onError);
      next.set(id, { output: current.output, track, sinkId });
    }
    for (const [id, gone] of playing) if (!next.has(id)) gone.output.dispose();
    playing = next;
  };

  const syncVideo = (): void => {
    for (const a of attachments) {
      const track = videoTrack(a.participant, a.source);
      env.showVideo(a.element, track ? streamOf(track) : null);
    }
  };

  /** Only changes reach the service. */
  const syncSubscriptions = (): void => {
    const next = new Map<string, boolean>();
    for (const [id, remote] of tracks) {
      const allowed = AUDIO_SOURCES.includes(remote.source)
        ? policy.canHear(remote.participant)
        : policy.canSee(remote.participant);
      next.set(id, allowed);
      if (subscribed.get(id) !== allowed)
        setSubscription(remote.participant, remote.source, allowed);
    }
    subscribed = next;
  };

  const sync = (): void => {
    syncAudio();
    syncVideo();
    syncSubscriptions();
    for (const { listener } of listeners) listener();
  };

  const detach = (attachment: Attachment): void => {
    if (!attachments.includes(attachment)) return;
    attachment.unwatch();
    attachments = attachments.filter((a) => a !== attachment);
    env.showVideo(attachment.element, null);
  };

  return {
    add(track) {
      tracks = new Map(tracks).set(key(track.participant, track.source), track);
      sync();
    },
    remove(track) {
      const id = key(track.participant, track.source);
      if (tracks.get(id)?.track !== track.track) return;
      const next = new Map(tracks);
      next.delete(id);
      tracks = next;
      sync();
    },
    removeParticipant(participant) {
      tracks = new Map(
        [...tracks].filter(([, t]) => t.participant !== participant),
      );
      sync();
    },
    clear() {
      tracks = new Map();
      sync();
    },
    refresh: sync,
    setLocalVideo(participant, track) {
      local = track ? { participant, track } : null;
      syncVideo();
      for (const { listener } of listeners) listener();
    },
    attach(participant, source, element) {
      for (const a of attachments.filter((x) => x.element === element))
        detach(a);
      const attachment: Attachment = {
        participant,
        source,
        element,
        unwatch: env.watchRemoval(element, () => {
          detach(attachment);
        }),
      };
      attachments = [...attachments, attachment];
      const track = videoTrack(participant, source);
      env.showVideo(element, track ? streamOf(track) : null);
      return () => {
        detach(attachment);
      };
    },
    videoStream(participant) {
      const track = videoTrack(participant, "camera");
      return track ? streamOf(track) : null;
    },
    has(participant, kind) {
      if (kind === "video") return videoTrack(participant, "camera") !== null;
      return (
        policy.canHear(participant) &&
        tracks.has(key(participant, "microphone"))
      );
    },
    onChange(listener) {
      const registration = { listener };
      listeners = [...listeners, registration];
      return () => {
        listeners = listeners.filter((r) => r !== registration);
      };
    },
  };
}
