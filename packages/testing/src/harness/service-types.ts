import type {
  MediaPermissions,
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
  readonly canPublish: MediaPermissions;
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
  setMuted(source: TrackSource, muted: boolean): Promise<void>;
  /** As the core mutes: on its own track. */
  setEnabled(source: TrackSource, enabled: boolean): void;
  unpublish(source: TrackSource): Promise<void>;
  /** Publishes the same local track again, as the core does after a hold. */
  republish(source: TrackSource): Promise<void>;
  setSubscription(
    participant: string,
    source: TrackSource,
    enabled: boolean,
  ): void;
  leave(): Promise<void>;
  events(): RecordedEvent[];
  remoteTracks(): TrackView[];
  localTracks(): TrackView[];
  /** Peak level (0-1) of a participant's remote microphone over `ms`; 0 without one. */
  audioLevel(participant: string, ms: number): Promise<number>;
  /** Mean luminance (0-255) of a participant's remote camera frame; 0 without one. */
  videoBrightness(participant: string): Promise<number>;
}

declare global {
  interface Window {
    serviceHarness?: ServiceHarness;
    /** Exposed by the contract suite before the page loads. */
    serviceSecrets?: () => Promise<Record<string, string>>;
  }
}
