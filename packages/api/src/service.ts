/**
 * Service plugin interfaces (handoff §3 "Plugin interfaces").
 *
 * DRAFT: written in milestone 1 so the mock service has something to
 * implement. Milestone 2 settles these against a real service and may
 * change any of them.
 */

/** A Foundry user id, taken from the service token, never self-asserted. */
export type ParticipantId = string;

export type TrackSource = "microphone" | "camera" | "screen" | "screen-audio";

/** Placeholder until settings schemas are settled in milestone 2. */
export type SettingsSchema = Readonly<Record<string, unknown>>;

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

export interface ConnectionStats {
  readonly roundTripMs?: number;
  readonly packetLoss?: number;
}

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
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface ServiceConnection {
  readonly capabilities: Observable<ServiceCapabilities>;
  connect(room: RoomSpec, token: string, signal: AbortSignal): Promise<void>;
  disconnect(reason: "user" | "switching" | "unload"): Promise<void>;
  publish(
    track: MediaStreamTrack,
    source: TrackSource,
  ): Promise<PublishedTrack>;
  replaceTrack(
    published: PublishedTrack,
    track: MediaStreamTrack,
  ): Promise<void>;
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
  getStats(): Promise<ConnectionStats>;
}

export interface ServiceDefinition {
  readonly id: string;
  readonly label: string;
  /** World settings, readable by every player: never secrets. */
  readonly settings?: SettingsSchema;
  /** Stored on the GM's device only (client scope). */
  readonly secrets?: SettingsSchema;
  /** Runs on the GM's client. */
  signToken?(request: TokenRequest, secrets: unknown): Promise<string>;
  readonly mediaOwnership: "core" | "service";
  /** Lazy: import the service SDK here, not at module load. */
  create(context: ServiceContext): Promise<ServiceConnection>;
}
