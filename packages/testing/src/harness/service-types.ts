import type {
  ConnectionStats,
  PublishRights,
  ScreenShareCapability,
  ServiceDefinition,
  ServiceErrorCode,
  TrackSource,
} from "@modular-av/api";

/**
 * A service package's `test/service/definition.ts` exports this. `params`
 * are public (in the page URL); `secrets` come from the test process and
 * never appear in a URL.
 */
export type CreateDefinition = (
  params: URLSearchParams,
  secrets: Readonly<Record<string, string>>,
) => ServiceDefinition;

export interface JoinOptions {
  readonly participant: string;
  readonly room: string;
  readonly canPublish: PublishRights;
  readonly ttlSeconds: number;
  /** Use this token instead of signing one (e.g. an expired one). */
  readonly token?: string;
}

export type JoinResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: ServiceErrorCode | null;
      readonly final: boolean | null;
      readonly name: string;
    };

/** Events, made serializable for Playwright. */
export type RecordedEvent =
  | {
      readonly type: "state";
      readonly state: string;
      readonly code?: ServiceErrorCode;
      readonly final?: boolean;
    }
  | {
      readonly type: "participantJoined" | "participantLeft";
      readonly participant: string;
    }
  | {
      readonly type: "trackAdded" | "trackRemoved";
      readonly participant: string;
      readonly source: TrackSource;
      readonly kind: string;
    }
  | {
      readonly type: "speaking";
      readonly participant: string;
      readonly speaking: boolean;
    };

export interface TrackView {
  readonly participant: string;
  readonly source: TrackSource;
  readonly readyState: MediaStreamTrackState;
  readonly enabled: boolean;
}

/** What the service harness page exposes to Playwright tests. */
export interface ServiceHarness {
  sign(options: JoinOptions): Promise<string>;
  join(options: JoinOptions): Promise<JoinResult>;
  publish(sources: readonly ("microphone" | "camera")[]): Promise<string[]>;
  /**
   * Publishes a stand-in screen share (the fake camera, and the fake
   * microphone as its sound when `audio`); the service can't tell.
   */
  publishScreen(audio: boolean): Promise<string[]>;
  /** Publishes tracks made as the core makes them (Web Audio, a generator). */
  publishCoreTracks(): Promise<string[]>;
  setMuted(source: TrackSource, muted: boolean): Promise<void>;
  /** As the core mutes: on its own track. */
  setEnabled(source: TrackSource, enabled: boolean): void;
  unpublish(source: TrackSource): Promise<void>;
  /** Publishes the same local track again, as the core does after a hold. */
  republish(source: TrackSource): Promise<void>;
  /**
   * As the core changes the camera's size: stops the published camera,
   * captures it again at about this width and height, and replaces it.
   */
  replaceCamera(width: number, height: number): Promise<void>;
  setSubscription(
    participant: string,
    source: TrackSource,
    enabled: boolean,
  ): void;
  leave(): Promise<void>;
  events(): RecordedEvent[];
  remoteTracks(): TrackView[];
  localTracks(): TrackView[];
  /** What the connection says it offers (`capabilities.features`), null if unknown. */
  features(): readonly string[] | null;
  /** What the connection says it carries of a screen share, null if nothing. */
  screenShare(): ScreenShareCapability | null;
  /** Peak level (0-1) of a participant's remote microphone (or `source`) over `ms`; 0 without one. */
  audioLevel(
    participant: string,
    ms: number,
    source?: "microphone" | "screen-audio",
  ): Promise<number>;
  /** Mean luminance (0-255) of a participant's remote camera (or `source`) frame; 0 without one. */
  videoBrightness(
    participant: string,
    source?: "camera" | "screen",
  ): Promise<number>;
  /** "WxH" of a participant's remote camera as it plays here; "" without one. */
  videoSize(participant: string): Promise<string>;
  /**
   * The connection's own stats (null), or a participant's; "none" if the
   * service can't tell, "failed" if it refused (e.g. not measured yet).
   */
  stats(
    participant: string | null,
  ): Promise<ConnectionStats | "none" | "failed">;
}

declare global {
  interface Window {
    serviceHarness?: ServiceHarness;
    /** Exposed by the contract suite before the page loads. */
    serviceSecrets?: () => Promise<Record<string, string>>;
  }
}
