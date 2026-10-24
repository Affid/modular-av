/**
 * Service plugin interfaces (handoff §3 "Plugin interfaces"), settled in
 * milestone 2 against LiveKit and milestone 4 against a P2P mesh.
 */

/** A Foundry user id, taken from the service token, never self-asserted. */
export type ParticipantId = string;

export type TrackSource = "microphone" | "camera" | "screen" | "screen-audio";

export interface Observable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export interface ServiceCapabilities {
  readonly moderation: boolean;
  readonly speakingDetection: boolean;
  readonly simulcast: boolean;
}

export type ServiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "resuming"
  | "lost"
  | "failed"
  | "disconnected";

export type ServiceErrorCode =
  | "auth"
  | "token-expired"
  | "network"
  | "full"
  | "kicked"
  | "duplicate"
  | "room-closed"
  | "unsupported";

export interface ServiceError {
  readonly code: ServiceErrorCode;
  /** Final reasons stop the core's reconnecting. */
  readonly final: boolean;
  readonly message?: string;
}

export type ConnectionQuality = "excellent" | "good" | "poor" | "lost";

export interface RemoteTrack {
  readonly participant: ParticipantId;
  readonly source: TrackSource;
  readonly track: MediaStreamTrack;
}

export interface PublishedTrack {
  readonly id: string;
  readonly source: TrackSource;
}

export interface RoomSpec {
  readonly name: string;
}

/** Built by the GM's core from what Foundry's server says, never from the request. */
export interface TokenRequest {
  readonly participant: ParticipantId;
  readonly room: string;
  readonly canPublish: { readonly audio: boolean; readonly video: boolean };
  readonly ttlSeconds: number;
}

export interface SubscriptionOptions {
  readonly enabled: boolean;
  readonly maxQuality?: "low" | "medium" | "high";
}

/** What a service measures; any of it may be missing. */
export interface ConnectionStats {
  readonly roundTripMs?: number;
  /** The share of packets lost lately, 0 to 1. */
  readonly packetLoss?: number;
  readonly jitterMs?: number;
  /** Through a relay (TURN) rather than direct. */
  readonly relayed?: boolean;
}

/**
 * `participantJoined` means a media path to them is up: entering the room
 * for a media server, the link to them for a P2P mesh. `trackAdded` for a
 * participant comes after their `participantJoined`.
 */
export interface ServiceEvents {
  state: (state: ServiceConnectionState, error?: ServiceError) => void;
  participantJoined: (participant: ParticipantId) => void;
  participantLeft: (participant: ParticipantId) => void;
  trackAdded: (track: RemoteTrack) => void;
  trackRemoved: (track: RemoteTrack) => void;
  speaking: (participant: ParticipantId, speaking: boolean) => void;
  quality: (participant: ParticipantId, quality: ConnectionQuality) => void;
  tokenExpiring: () => void;
}

export interface ServiceContext {
  readonly participant: ParticipantId;
}

export interface ServiceConnection {
  readonly capabilities: Observable<ServiceCapabilities>;
  /**
   * Resolves once joined; rejects on failure (with `serviceError` set to a
   * `ServiceError` when the reason is known). `state` events matter to the
   * core only after this resolved. `token` is null when the service
   * needs none (`needsToken()` is false).
   */
  connect(
    room: RoomSpec,
    token: string | null,
    signal: AbortSignal,
  ): Promise<void>;
  disconnect(reason: "user" | "switching" | "unload"): Promise<void>;
  publish(
    track: MediaStreamTrack,
    source: TrackSource,
  ): Promise<PublishedTrack>;
  replaceTrack(
    published: PublishedTrack,
    track: MediaStreamTrack,
  ): Promise<void>;
  /** Stops sending; never stops the track, which the core owns. */
  unpublish(published: PublishedTrack): Promise<void>;
  /** Signalling and bandwidth only: the core mutes its own final track. */
  setMuted(published: PublishedTrack, muted: boolean): Promise<void>;
  setSubscription(
    participant: ParticipantId,
    source: TrackSource,
    options: SubscriptionOptions,
  ): void;
  readonly moderation?: {
    forceMute(participant: ParticipantId, source: TrackSource): Promise<void>;
    remove(participant: ParticipantId): Promise<void>;
  };
  on<E extends keyof ServiceEvents>(
    event: E,
    handler: ServiceEvents[E],
  ): () => void;
  /** This client's own connection. */
  getStats(): Promise<ConnectionStats>;
  /**
   * The media from one participant (for a P2P mesh, the link to them).
   * Optional: without it, UIs show only `ParticipantState.quality`.
   */
  getParticipantStats?(participant: ParticipantId): Promise<ConnectionStats>;
}

/**
 * A service module registers its own Foundry settings under its own id:
 * world settings for what every player may read, client settings on the
 * GM's device for secrets.
 */
export interface ServiceDefinition {
  readonly id: string;
  /** Plain text or an i18n key. */
  readonly label: string;
  /**
   * Whether joining needs a token from the GM relay. A service that needs
   * none (P2P: Foundry's server already names every sender) joins without
   * a GM online. Asked before every join.
   */
  needsToken(): boolean;
  /** Whether this device holds what `signToken` needs (the GM's secret). */
  canSignTokens?(): boolean;
  /** Runs on a GM's client, only when `canSignTokens()` is true. */
  signToken?(request: TokenRequest): Promise<string>;
  readonly mediaOwnership: "core" | "service";
  /** Lazy: import the service SDK here, not at module load. */
  create(context: ServiceContext): Promise<ServiceConnection>;
}
