/**
 * The slice of lib-jitsi-meet this module uses. The library ships as one
 * prebuilt file (see `modularAV.downloads`), not as an npm package, so its
 * own types aren't available; these follow the pinned version's source.
 */

export type Listener = (...args: never[]) => void;

export interface Emitting {
  addEventListener(event: string, listener: Listener): void;
  removeEventListener(event: string, listener: Listener): void;
}

export interface JitsiParticipant {
  getId(): string;
  /** From the server (Prosody's presence_identity), never the client. */
  getIdentity(): { user?: Readonly<Record<string, string>> } | undefined;
}

export interface JitsiTrack {
  getType(): "audio" | "video";
  getTrack(): MediaStreamTrack;
  getParticipantId(): string;
  getSourceName(): string;
  getVideoType(): "camera" | "desktop" | undefined;
  isLocal(): boolean;
}

export interface JitsiLocalTrack extends JitsiTrack {
  mute(): Promise<void>;
  unmute(): Promise<void>;
  /** Stops the stream it was given: never called on core tracks. */
  dispose(): Promise<void>;
}

export interface ReceiverConstraints {
  readonly lastN?: number;
  readonly defaultConstraints?: { readonly maxHeight: number };
  readonly constraints?: Readonly<Record<string, { maxHeight: number }>>;
}

export interface AudioSubscription {
  readonly all: boolean;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface JitsiConference {
  on(event: string, listener: Listener): void;
  off(event: string, listener: Listener): void;
  join(): void;
  leave(reason?: string): Promise<void>;
  addTrack(track: JitsiLocalTrack): Promise<void>;
  removeTrack(track: JitsiLocalTrack): Promise<void>;
  replaceTrack(
    oldTrack: JitsiLocalTrack | null,
    newTrack: JitsiLocalTrack | null,
  ): Promise<void>;
  getParticipantById(id: string): JitsiParticipant | undefined;
  getParticipants(): JitsiParticipant[];
  setReceiverConstraints(constraints: ReceiverConstraints): void;
  setAudioSubscriptionMode(subscription: AudioSubscription): void;
  myUserId(): string;
  isModerator(): boolean;
}

export interface JitsiConnectionOptions {
  readonly hosts: { readonly domain: string; readonly muc: string };
  readonly serviceUrl: string;
}

export interface JitsiConnection extends Emitting {
  connect(options?: Record<string, unknown>): void;
  disconnect(): Promise<void>;
  refreshToken(token: string): Promise<void>;
  initJitsiConference(
    name: string,
    options: Record<string, unknown>,
  ): JitsiConference;
}

export interface VideoConstraints {
  readonly height: { readonly ideal: number };
  readonly width: { readonly ideal: number };
}

export interface LocalTrackInfo {
  readonly stream: MediaStream;
  readonly mediaType: "audio" | "video";
  readonly videoType?: "camera";
  /** What it would ask getUserMedia for; it sizes simulcast layers from it. */
  readonly constraints?: VideoConstraints;
}

export type EventNames = Readonly<Record<string, string>>;

/** Where @jitsi/logger sends messages, by level. */
export type LogTransport = Partial<
  Record<"warn" | "error", (...args: unknown[]) => void>
>;

export interface JitsiMeetJS {
  readonly version?: string;
  init(options: Record<string, unknown>): void;
  setLogLevel(level: string): void;
  addGlobalLogTransport(transport: LogTransport | Console): void;
  removeGlobalLogTransport(transport: LogTransport | Console): void;
  setGlobalLogOptions(options: { disableCallerInfo?: boolean }): void;
  readonly logLevels: Readonly<Record<string, string>>;
  readonly JitsiConnection: new (
    appId: string | null,
    token: string | null,
    options: JitsiConnectionOptions,
  ) => JitsiConnection;
  createLocalTracksFromMediaStreams(
    infos: readonly LocalTrackInfo[],
  ): JitsiLocalTrack[];
  readonly events: {
    readonly connection: EventNames;
    readonly conference: EventNames;
    readonly connectionQuality: EventNames;
  };
  readonly errors: {
    readonly connection: EventNames;
    readonly conference: EventNames;
  };
}
