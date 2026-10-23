import type {
  ConnectionQuality,
  ParticipantId,
  TrackSource,
} from "@modular-av/api";
import {
  ConnectionQuality as LKQuality,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Room,
  RoomEvent,
  Track,
} from "livekit-client";
import type { Emitter } from "./emitter.ts";
import { fromDisconnectReason } from "./errors.ts";

export const SOURCES: Readonly<Record<TrackSource, Track.Source>> = {
  microphone: Track.Source.Microphone,
  camera: Track.Source.Camera,
  screen: Track.Source.ScreenShare,
  "screen-audio": Track.Source.ScreenShareAudio,
};

export function toSource(source: Track.Source): TrackSource | null {
  const entry = Object.entries(SOURCES).find(([, lk]) => lk === source);
  return entry ? (entry[0] as TrackSource) : null;
}

const QUALITY: Readonly<Partial<Record<LKQuality, ConnectionQuality>>> = {
  [LKQuality.Excellent]: "excellent",
  [LKQuality.Good]: "good",
  [LKQuality.Poor]: "poor",
  [LKQuality.Lost]: "lost",
};

/** Whether the room was left on purpose: then its end is not reported. */
export interface Leaving {
  readonly leaving: boolean;
}

function trackEvent(
  emitter: Emitter,
  name: "trackAdded" | "trackRemoved",
): (
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
) => void {
  return (track, publication, participant) => {
    const source = toSource(publication.source);
    if (source)
      emitter.emit(name, {
        participant: participant.identity,
        source,
        track: track.mediaStreamTrack,
      });
  };
}

/** Reports speaking changes, from LiveKit's list of active speakers. */
function speakers(
  emitter: Emitter,
  room: Room,
): (active: readonly Participant[]) => void {
  let speaking: ReadonlySet<ParticipantId> = new Set();
  return (active) => {
    const self = room.localParticipant.identity;
    const now = new Set(
      active.map((p) => p.identity).filter((id) => id !== self),
    );
    for (const id of now)
      if (!speaking.has(id)) emitter.emit("speaking", id, true);
    for (const id of speaking)
      if (!now.has(id)) emitter.emit("speaking", id, false);
    speaking = now;
  };
}

/** Turns a LiveKit room's events into the core's service events. */
export function wireRoom(room: Room, emitter: Emitter, state: Leaving): void {
  room
    .on(RoomEvent.Reconnecting, () => {
      emitter.emit("state", "resuming");
    })
    .on(RoomEvent.Reconnected, () => {
      emitter.emit("state", "connected");
    })
    .on(RoomEvent.Disconnected, (reason) => {
      const error = state.leaving ? null : fromDisconnectReason(reason);
      if (!error) emitter.emit("state", "disconnected");
      else emitter.emit("state", error.final ? "failed" : "lost", error);
    })
    .on(RoomEvent.ParticipantConnected, (p) => {
      emitter.emit("participantJoined", p.identity);
    })
    .on(RoomEvent.ParticipantDisconnected, (p) => {
      emitter.emit("participantLeft", p.identity);
    })
    .on(RoomEvent.TrackSubscribed, trackEvent(emitter, "trackAdded"))
    .on(RoomEvent.TrackUnsubscribed, trackEvent(emitter, "trackRemoved"))
    .on(RoomEvent.ActiveSpeakersChanged, speakers(emitter, room))
    .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      const mapped = QUALITY[quality];
      if (mapped) emitter.emit("quality", participant.identity, mapped);
    });
}
