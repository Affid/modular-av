import type {
  PublishedTrack,
  ServiceCapabilities,
  ServiceConnection,
  ServiceContext,
} from "@modular-av/api";
import {
  type LocalTrackPublication,
  type RemoteParticipant,
  Room,
  RoomEvent,
  VideoPresets,
  VideoQuality,
} from "livekit-client";
import { featuresOf } from "./cloud.ts";
import { createEmitter } from "./emitter.ts";
import { fromConnectError } from "./errors.ts";
import { LiveKitServiceError } from "./failure.ts";
import { SOURCES, wireRoom } from "./room-events.ts";
import type { Rooms } from "./rooms.ts";
import { fromReceivers, fromSender, type PacketTotals } from "./stats.ts";

const NO_PACKETS: PacketTotals = { lost: 0, received: 0 };

/** The stats of every receiver of a participant's tracks. */
async function receiverReports(
  participant: RemoteParticipant,
): Promise<ReadonlyMap<string, unknown>[]> {
  const receivers = [...participant.trackPublications.values()].flatMap((p) =>
    p.track?.receiver ? [p.track.receiver] : [],
  );
  return Promise.all(receivers.map((r) => r.getStats()));
}

/** Loaded with `import()` only when a call starts: the SDK is heavy. */
export interface LiveKitConnectionOptions {
  readonly url: string;
  /** Told about the room once joined, and when it is gone. */
  readonly rooms: Pick<Rooms, "set" | "clear">;
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
 * The core attaches videos itself and tells `setSubscription` what is on
 * screen and how big, so LiveKit's adaptive stream (which watches the
 * elements LiveKit attached) stays off.
 */
function createRoom(): Room {
  return new Room({
    adaptiveStream: false,
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

type CapabilityListener = (capabilities: ServiceCapabilities) => void;

/** The server says what it offers (e.g. LiveKit Cloud) once joined. */
function createCapabilities(): {
  readonly observable: ServiceConnection["capabilities"];
  joined(room: Room): void;
} {
  let current = CAPABILITIES;
  let listeners: readonly CapabilityListener[] = [];
  return {
    observable: {
      get: () => current,
      subscribe(listener) {
        listeners = [...listeners, listener];
        return () => {
          listeners = listeners.filter((l) => l !== listener);
        };
      },
    },
    joined(room) {
      current = { ...CAPABILITIES, features: featuresOf(room.serverInfo) };
      for (const listener of listeners) listener(current);
    },
  };
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
  const capabilities = createCapabilities();
  room.on(RoomEvent.Disconnected, () => {
    options.rooms.clear(room);
  });
  let publications = new Map<string, LocalTrackPublication>();
  /** Per participant, for the loss since the last reading. */
  let totals = new Map<string, PacketTotals>();
  wireRoom(room, emitter, state);

  const find = (published: PublishedTrack): LocalTrackPublication => {
    const publication = publications.get(published.id);
    if (!publication)
      throw new Error(`Unknown published track ${published.id}`);
    return publication;
  };

  return {
    capabilities: capabilities.observable,
    async connect(_room, token, signal) {
      if (token === null)
        throw new LiveKitServiceError({
          code: "auth",
          final: true,
          message: "LiveKit needs a join token",
        });
      await join(room, options.url, token, signal);
      capabilities.joined(room);
      options.rooms.set(room);
      for (const participant of room.remoteParticipants.values())
        emitter.emit("participantJoined", participant.identity);
      emitter.emit("state", "connected");
    },
    async disconnect() {
      state.leaving = true;
      options.rooms.clear(room);
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
    async getStats() {
      const mic = [...publications.values()].find(
        (p) => p.audioTrack !== undefined,
      )?.audioTrack;
      return fromSender(await mic?.getSenderStats());
    },
    async getParticipantStats(participant) {
      const remote = room.remoteParticipants.get(participant);
      if (!remote) throw new Error(`${participant} is not in the room`);
      const reading = fromReceivers(
        await receiverReports(remote),
        totals.get(participant) ?? NO_PACKETS,
      );
      totals = new Map(totals).set(participant, reading.totals);
      return reading.stats;
    },
  };
}
