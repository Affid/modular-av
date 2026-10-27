import type {
  ParticipantId,
  RemoteTrack,
  ServiceConnectionState,
  ServiceError,
  ServiceEvents,
  SubscriptionOptions,
  TrackSource,
} from "@modular-av/api";
import type { Emitter } from "./emitter.ts";

/** Thrown by the mock service with the reason a real service would give. */
export class MockServiceFailure extends Error {
  readonly serviceError: ServiceError;

  constructor(serviceError: ServiceError) {
    super(serviceError.message ?? serviceError.code);
    this.name = "MockServiceFailure";
    this.serviceError = serviceError;
  }
}

/** One connection's presence in a room, as the hub (the "server") sees it. */
export interface Member {
  readonly participant: ParticipantId;
  readonly room: string;
  readonly events: Emitter<ServiceEvents>;
  tracks(): readonly RemoteTrack[];
  /** Removes the member from its room, then reports the final state. */
  end(state: "lost" | "failed", error: ServiceError): void;
  setState(state: ServiceConnectionState): void;
}

/** What a mock connection may ask of the hub. */
export interface Hub {
  readonly now: () => number;
  readonly moderation: boolean;
  readonly updatesTokens: boolean;
  readonly features: readonly string[];
  readonly needsToken: boolean;
  join(member: Member): void;
  leave(member: Member): void;
  /** Who is in a room now. */
  participants(room: string): readonly ParticipantId[];
  trackAdded(member: Member, track: RemoteTrack): void;
  trackRemoved(member: Member, track: RemoteTrack): void;
  setMuted(
    participant: ParticipantId,
    source: TrackSource,
    muted: boolean,
  ): void;
  setSubscription(
    viewer: ParticipantId,
    target: ParticipantId,
    source: TrackSource,
    options: SubscriptionOptions,
  ): void;
  kick(participant: ParticipantId): void;
  /** Errors thrown by event handlers, kept for the test to inspect. */
  recordError(error: unknown): void;
  recordTokenUpdate(participant: ParticipantId): void;
}
