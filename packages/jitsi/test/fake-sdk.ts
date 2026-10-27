import type {
  AudioSubscription,
  JitsiConference,
  JitsiConnection,
  JitsiConnectionOptions,
  JitsiLocalTrack,
  JitsiMeetJS,
  JitsiParticipant,
  JitsiTrack,
  Listener,
  LocalTrackInfo,
  ReceiverConstraints,
} from "../src/sdk-types.ts";

/**
 * A stand-in for lib-jitsi-meet in unit tests, written from its source:
 * event names as the pinned version has them, and its local tracks stop
 * their stream when disposed, as the real ones do.
 */

const CONNECTION = {
  CONNECTION_ESTABLISHED: "connection.connectionEstablished",
  CONNECTION_FAILED: "connection.connectionFailed",
  CONNECTION_DISCONNECTED: "connection.connectionDisconnected",
  CONNECTION_TOKEN_EXPIRED: "connection.token_expired",
} as const;

const CONFERENCE = {
  CONFERENCE_JOINED: "conference.joined",
  CONFERENCE_FAILED: "conference.failed",
  CONNECTION_INTERRUPTED: "conference.connectionInterrupted",
  CONNECTION_RESTORED: "conference.connectionRestored",
  KICKED: "conference.kicked",
  TRACK_ADDED: "conference.trackAdded",
  TRACK_REMOVED: "conference.trackRemoved",
  USER_JOINED: "conference.userJoined",
  USER_LEFT: "conference.userLeft",
} as const;

const QUALITY = {
  LOCAL_STATS_UPDATED: "cq.local_stats_updated",
  REMOTE_STATS_UPDATED: "cq.remote_stats_updated",
} as const;

class Events {
  private listeners = new Map<string, readonly Listener[]>();

  on(event: string, listener: Listener): void {
    this.listeners = new Map(this.listeners).set(event, [
      ...(this.listeners.get(event) ?? []),
      listener,
    ]);
  }

  off(event: string, listener: Listener): void {
    this.listeners = new Map(this.listeners).set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== listener),
    );
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? [])
      (listener as (...a: unknown[]) => void)(...args);
  }
}

export class FakeLocalTrack implements JitsiLocalTrack {
  readonly calls: string[] = [];
  readonly info: LocalTrackInfo;
  constructor(info: LocalTrackInfo) {
    this.info = info;
  }
  getType = (): "audio" | "video" => this.info.mediaType;
  getTrack = (): MediaStreamTrack => {
    const [track] = this.info.stream.getTracks();
    if (!track) throw new Error("no track");
    return track;
  };
  getParticipantId = (): string => "local";
  getSourceName = (): string => `local-${this.info.mediaType}`;
  getVideoType = (): "camera" | undefined => this.info.videoType;
  isLocal = (): boolean => true;
  mute = (): Promise<void> => {
    this.calls.push("mute");
    // Audio: lib-jitsi-meet writes `enabled`; video would stop the stream.
    if (this.info.mediaType === "video") this.stopStream();
    else for (const t of this.info.stream.getTracks()) t.enabled = false;
    return Promise.resolve();
  };
  unmute = (): Promise<void> => {
    this.calls.push("unmute");
    for (const t of this.info.stream.getTracks()) t.enabled = true;
    return Promise.resolve();
  };
  dispose = (): Promise<void> => {
    this.calls.push("dispose");
    this.stopStream();
    return Promise.resolve();
  };
  private stopStream(): void {
    for (const t of this.info.stream.getTracks()) t.stop();
  }
}

export interface RemoteTrackInit {
  readonly endpoint: string;
  readonly kind: "audio" | "video";
  readonly videoType?: "camera" | "desktop";
  readonly track: MediaStreamTrack;
}

export const remoteTrack = (init: RemoteTrackInit): JitsiTrack => ({
  getType: () => init.kind,
  getTrack: () => init.track,
  getParticipantId: () => init.endpoint,
  getSourceName: () => `${init.endpoint}-${init.kind[0] ?? ""}0`,
  getVideoType: () =>
    init.kind === "video" ? (init.videoType ?? "camera") : undefined,
  isLocal: () => false,
});

export const participant = (
  endpoint: string,
  id: string | null,
): JitsiParticipant => ({
  getId: () => endpoint,
  getIdentity: () => (id === null ? undefined : { user: { id } }),
});

export class FakeConference extends Events implements JitsiConference {
  joined = false;
  left = false;
  readonly added: JitsiLocalTrack[] = [];
  readonly removed: JitsiLocalTrack[] = [];
  readonly replaced: [JitsiLocalTrack | null, JitsiLocalTrack | null][] = [];
  constraints: ReceiverConstraints | null = null;
  audio: AudioSubscription | null = null;
  participants: JitsiParticipant[] = [];
  /** What `join()` does: "join", or fail with this conference error. */
  joinOutcome = "join";
  readonly name: string;
  readonly options: Record<string, unknown>;

  constructor(name: string, options: Record<string, unknown>) {
    super();
    this.name = name;
    this.options = options;
  }

  join(): void {
    queueMicrotask(() => {
      if (this.joinOutcome === "join") {
        this.joined = true;
        this.emit(CONFERENCE.CONFERENCE_JOINED);
      } else this.emit(CONFERENCE.CONFERENCE_FAILED, this.joinOutcome);
    });
  }
  leave(): Promise<void> {
    this.left = true;
    return Promise.resolve();
  }
  addTrack(track: JitsiLocalTrack): Promise<void> {
    this.added.push(track);
    return Promise.resolve();
  }
  removeTrack(track: JitsiLocalTrack): Promise<void> {
    this.removed.push(track);
    return Promise.resolve();
  }
  replaceTrack(
    a: JitsiLocalTrack | null,
    b: JitsiLocalTrack | null,
  ): Promise<void> {
    this.replaced.push([a, b]);
    return Promise.resolve();
  }
  getParticipantById(id: string): JitsiParticipant | undefined {
    return this.participants.find((p) => p.getId() === id);
  }
  getParticipants(): JitsiParticipant[] {
    return this.participants;
  }
  setReceiverConstraints(constraints: ReceiverConstraints): void {
    this.constraints = constraints;
  }
  setAudioSubscriptionMode(subscription: AudioSubscription): void {
    this.audio = subscription;
  }
  myUserId(): string {
    return "self";
  }
  /** Whether the server made this client a moderator. */
  moderator = false;
  isModerator(): boolean {
    return this.moderator;
  }

  /** Someone the server vouched for (or didn't: `id` null) joins. */
  userJoins(endpoint: string, id: string | null): void {
    const p = participant(endpoint, id);
    this.participants = [...this.participants, p];
    this.emit(CONFERENCE.USER_JOINED, endpoint, p);
  }
  userLeaves(endpoint: string): void {
    const p = this.getParticipantById(endpoint);
    this.participants = this.participants.filter((x) => x !== p);
    this.emit(CONFERENCE.USER_LEFT, endpoint, p);
  }
}

export class FakeConnection extends Events implements JitsiConnection {
  readonly refreshed: string[] = [];
  conference: FakeConference | null = null;
  disconnected = false;
  /** What `connect()` does: "open", or fail with this connection error. */
  outcome = "open";
  readonly appId: string | null;
  readonly token: string | null;
  readonly options: JitsiConnectionOptions;

  constructor(
    appId: string | null,
    token: string | null,
    options: JitsiConnectionOptions,
  ) {
    super();
    this.appId = appId;
    this.token = token;
    this.options = options;
  }

  addEventListener(event: string, listener: Listener): void {
    this.on(event, listener);
  }
  removeEventListener(event: string, listener: Listener): void {
    this.off(event, listener);
  }
  connect(): void {
    queueMicrotask(() => {
      if (this.outcome === "open") this.emit(CONNECTION.CONNECTION_ESTABLISHED);
      else this.emit(CONNECTION.CONNECTION_FAILED, this.outcome);
    });
  }
  disconnect(): Promise<void> {
    this.disconnected = true;
    return Promise.resolve();
  }
  refreshToken(token: string): Promise<void> {
    this.refreshed.push(token);
    return Promise.resolve();
  }
  initJitsiConference(
    name: string,
    options: Record<string, unknown>,
  ): FakeConference {
    this.conference = new FakeConference(name, options);
    return this.conference;
  }
}

export interface FakeSdk extends JitsiMeetJS {
  readonly connections: FakeConnection[];
  readonly localTracks: FakeLocalTrack[];
  /** Applied to each connection as it is made. */
  setup: (connection: FakeConnection) => void;
}

export function createFakeSdk(): FakeSdk {
  const connections: FakeConnection[] = [];
  const localTracks: FakeLocalTrack[] = [];
  const sdk: FakeSdk = {
    connections,
    localTracks,
    setup: () => undefined,
    init: () => undefined,
    setLogLevel: () => undefined,
    addGlobalLogTransport: () => undefined,
    removeGlobalLogTransport: () => undefined,
    setGlobalLogOptions: () => undefined,
    logLevels: { ERROR: "error" },
    JitsiConnection: class extends FakeConnection {
      constructor(
        appId: string | null,
        token: string | null,
        options: JitsiConnectionOptions,
      ) {
        super(appId, token, options);
        connections.push(this);
        sdk.setup(this);
      }
    },
    createLocalTracksFromMediaStreams(infos) {
      const made = infos.map((info) => new FakeLocalTrack(info));
      localTracks.push(...made);
      return made;
    },
    events: {
      connection: CONNECTION,
      conference: CONFERENCE,
      connectionQuality: QUALITY,
    },
    errors: { connection: {}, conference: {} },
  };
  return sdk;
}

export const EVENTS = { CONNECTION, CONFERENCE, QUALITY } as const;
