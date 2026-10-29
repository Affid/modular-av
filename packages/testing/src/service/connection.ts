import type {
  ParticipantId,
  PublishedTrack,
  RemoteTrack,
  ServiceCapabilities,
  ServiceConnection,
  ServiceConnectionState,
  ServiceError,
  ServiceEvents,
  TrackSource,
} from "@modular-av/api";
import { createEmitter } from "./emitter.ts";
import { type Hub, type Member, MockServiceFailure } from "./internals.ts";
import { verifyMockToken } from "./token.ts";

const AUDIO_SOURCES: readonly TrackSource[] = ["microphone", "screen-audio"];
const STATS = { roundTripMs: 20, packetLoss: 0 } as const;
const PARTICIPANT_STATS = {
  roundTripMs: 30,
  packetLoss: 0,
  jitterMs: 5,
} as const;

/** Read through a call: the signal can change while a connect awaits. */
const isAborted = (signal: AbortSignal): boolean => signal.aborted;

/** Stands for a network round trip, so callers never rely on sync results. */
const roundTrip = (): Promise<void> => Promise.resolve();

interface Publication {
  readonly id: string;
  readonly source: TrackSource;
  readonly track: MediaStreamTrack;
}

export function createMockConnection(
  hub: Hub,
  participant: ParticipantId,
): ServiceConnection {
  const events = createEmitter<ServiceEvents>((error) => {
    hub.recordError(error);
  });
  const base: ServiceCapabilities = {
    speakingDetection: true,
  };
  // Like a server's edition, the features are known once joined.
  let capabilities = base;
  let capabilityListeners: readonly ((c: ServiceCapabilities) => void)[] = [];
  const reportFeatures = (): void => {
    capabilities = { ...base, features: hub.features };
    for (const listener of capabilityListeners) listener(capabilities);
  };
  let state: ServiceConnectionState = "idle";
  let member: Member | undefined;
  let canPublish = { audio: false, video: false };
  let publications: readonly Publication[] = [];
  let nextPublication = 1;

  const setState = (
    next: ServiceConnectionState,
    error?: ServiceError,
  ): void => {
    state = next;
    if (error) events.emit("state", next, error);
    else events.emit("state", next);
  };

  const remote = (p: Publication): RemoteTrack => ({
    participant,
    source: p.source,
    track: p.track,
  });

  const leaveRoom = (): void => {
    if (member) hub.leave(member);
    member = undefined;
    publications = [];
  };

  const requireMember = (): Member => {
    if (!member || state !== "connected")
      throw new Error("The mock service is not connected");
    return member;
  };

  const createMember = (room: string): Member => ({
    participant,
    room,
    events,
    tracks: () => publications.map(remote),
    end(endState, error) {
      leaveRoom();
      setState(endState, error);
    },
    setState: (next) => {
      setState(next);
    },
  });

  return {
    capabilities: {
      get: () => capabilities,
      subscribe(listener) {
        capabilityListeners = [...capabilityListeners, listener];
        return () => {
          capabilityListeners = capabilityListeners.filter(
            (l) => l !== listener,
          );
        };
      },
    },

    async connect(room, token, signal) {
      if (member) throw new Error("The mock service is already connected");
      const aborted = (): DOMException =>
        new DOMException("The connection attempt was aborted", "AbortError");
      if (signal.aborted) throw aborted();
      setState("connecting");
      await roundTrip();
      if (isAborted(signal)) {
        setState("disconnected");
        throw aborted();
      }
      const claims = hub.needsToken
        ? verifyMockToken(
            token ?? "",
            { participant, room: room.name },
            hub.now(),
          )
        : { canPublish: { audio: true, video: true } };
      if ("code" in claims) {
        setState("failed", claims);
        throw new MockServiceFailure(claims);
      }
      canPublish = claims.canPublish;
      member = createMember(room.name);
      hub.join(member);
      reportFeatures();
      setState("connected");
    },

    async disconnect() {
      await roundTrip();
      // After a failure or a loss the final state (and its reason) stays.
      if (!member && state !== "connecting") return;
      leaveRoom();
      setState("disconnected");
    },

    async publish(track, source) {
      await roundTrip();
      const self = requireMember();
      const allowed = AUDIO_SOURCES.includes(source)
        ? canPublish.audio
        : canPublish.video;
      if (!allowed)
        throw new Error(`Publishing ${source} is not allowed by the token`);
      const publication = {
        id: `${participant}-${String(nextPublication++)}`,
        source,
        track,
      };
      publications = [...publications, publication];
      hub.trackAdded(self, remote(publication));
      return { id: publication.id, source };
    },

    async replaceTrack(published: PublishedTrack, track) {
      await roundTrip();
      const self = requireMember();
      const old = publications.find((p) => p.id === published.id);
      if (!old) throw new Error(`Unknown published track ${published.id}`);
      const next = { ...old, track };
      publications = publications.map((p) => (p === old ? next : p));
      hub.trackRemoved(self, remote(old));
      hub.trackAdded(self, remote(next));
    },

    async unpublish(published) {
      await roundTrip();
      const self = requireMember();
      const old = publications.find((p) => p.id === published.id);
      if (!old) return;
      publications = publications.filter((p) => p !== old);
      hub.trackRemoved(self, remote(old));
    },

    async setMuted(published, muted) {
      await roundTrip();
      hub.setMuted(participant, published.source, muted);
    },

    setSubscription(target, source, options) {
      hub.setSubscription(participant, target, source, options);
    },

    ...(hub.updatesTokens
      ? {
          /** Like a server: takes only a valid token for this player and room. */
          async updateToken(token: string) {
            await roundTrip();
            const self = requireMember();
            const claims = verifyMockToken(
              token,
              { participant, room: self.room },
              hub.now(),
            );
            if ("code" in claims) throw new MockServiceFailure(claims);
            hub.recordTokenUpdate(participant);
          },
        }
      : {}),

    on: (event, handler) => events.on(event, handler),

    getStats: () => Promise.resolve(STATS),

    getParticipantStats(target) {
      const inRoom =
        member !== undefined && hub.participants(member.room).includes(target);
      return inRoom
        ? Promise.resolve(PARTICIPANT_STATS)
        : Promise.reject(new Error(`${target} is not in the call`));
    },
  };
}
