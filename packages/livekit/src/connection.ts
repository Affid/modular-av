import type {
  PublishedTrack,
  ServiceCapabilities,
  ServiceConnection,
  ServiceContext,
} from "@modular-av/api";
import {
  type LocalTrackPublication,
  Room,
  VideoPresets,
  VideoQuality,
} from "livekit-client";
import { createEmitter } from "./emitter.ts";
import { fromConnectError } from "./errors.ts";
import { LiveKitServiceError } from "./failure.ts";
import { SOURCES, wireRoom } from "./room-events.ts";

/** Loaded with `import()` only when a call starts: the SDK is heavy. */
export interface LiveKitConnectionOptions {
  readonly url: string;
  readonly onError: (error: unknown) => void;
}

const CAPABILITIES: ServiceCapabilities = {
  moderation: false,
  speakingDetection: true,
  simulcast: true,
};

const QUALITIES = {
  low: VideoQuality.LOW,
  medium: VideoQuality.MEDIUM,
  high: VideoQuality.HIGH,
} as const;

/**
 * Defaults that worked for the fork (handoff §6): VP8, simulcast at 180p
 * and 360p, DTX. The core owns the tracks, so LiveKit must never stop them.
 */
function createRoom(): Room {
  return new Room({
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: false,
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      videoCodec: "vp8",
      dtx: true,
      red: true,
    },
  });
}

/** Read through a call: the signal can change while `connect` awaits. */
const isAborted = (signal: AbortSignal): boolean => signal.aborted;

const aborted = (): DOMException =>
  new DOMException("The connection attempt was aborted", "AbortError");

async function join(
  room: Room,
  url: string,
  token: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw aborted();
  const onAbort = (): void => {
    void room.disconnect(false);
  };
  signal.addEventListener("abort", onAbort);
  try {
    await room.connect(url, token, { autoSubscribe: true });
  } catch (error: unknown) {
    if (isAborted(signal)) throw aborted();
    throw new LiveKitServiceError(
      fromConnectError(error, { token, now: Date.now() }),
      { cause: error },
    );
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function createLiveKitConnection(
  _context: ServiceContext,
  options: LiveKitConnectionOptions,
): ServiceConnection {
  const room = createRoom();
  const emitter = createEmitter(options.onError);
  const state = { leaving: false };
  let publications = new Map<string, LocalTrackPublication>();
  wireRoom(room, emitter, state);

  const find = (published: PublishedTrack): LocalTrackPublication => {
    const publication = publications.get(published.id);
    if (!publication)
      throw new Error(`Unknown published track ${published.id}`);
    return publication;
  };

  return {
    capabilities: { get: () => CAPABILITIES, subscribe: () => () => undefined },
    async connect(_room, token, signal) {
      if (token === null)
        throw new LiveKitServiceError({
          code: "auth",
          final: true,
          message: "LiveKit needs a join token",
        });
      await join(room, options.url, token, signal);
      for (const participant of room.remoteParticipants.values())
        emitter.emit("participantJoined", participant.identity);
      emitter.emit("state", "connected");
    },
    async disconnect() {
      state.leaving = true;
      await room.disconnect(false);
    },
    async publish(track, source) {
      const publication = await room.localParticipant.publishTrack(track, {
        source: SOURCES[source],
      });
      publications = new Map(publications).set(
        publication.trackSid,
        publication,
      );
      return { id: publication.trackSid, source };
    },
    async replaceTrack(published, track) {
      await find(published).track?.replaceTrack(track, true);
    },
    async unpublish(published) {
      const publication = publications.get(published.id);
      const next = new Map(publications);
      next.delete(published.id);
      publications = next;
      if (publication?.track)
        await room.localParticipant.unpublishTrack(publication.track, false);
    },
    /** LiveKit writes `track.enabled` here; the core applies its own after. */
    async setMuted(published, muted) {
      const publication = find(published);
      if (muted) await publication.mute();
      else await publication.unmute();
    },
    /** Pauses rather than unsubscribes, so the track can come back. */
    setSubscription(participant, source, subscription) {
      const publication = room.remoteParticipants
        .get(participant)
        ?.getTrackPublication(SOURCES[source]);
      if (!publication) return;
      publication.setEnabled(subscription.enabled);
      if (subscription.maxQuality)
        publication.setVideoQuality(QUALITIES[subscription.maxQuality]);
    },
    on: (event, handler) => emitter.on(event, handler),
    getStats: () => Promise.resolve({}),
  };
}
