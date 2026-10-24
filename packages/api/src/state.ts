import type { ParticipantId, ServiceCapabilities } from "./service.ts";

/**
 * Where the local player's session stands.
 *
 * - `idle`: not started (before `ready`, or A/V is disabled for the world).
 * - `waiting-for-token`: asking for a join token.
 * - `waiting-for-gm`: no GM who can hand out tokens is online.
 * - `connecting`, `connected`: joining, joined.
 * - `resuming`: the service is recovering its transport by itself.
 * - `retrying`: the core waits for `nextRetryAt`, then tries again.
 * - `left`: stopped for good, see `reason`.
 */
export type SessionStatus =
  | "idle"
  | "waiting-for-token"
  | "waiting-for-gm"
  | "connecting"
  | "connected"
  | "resuming"
  | "retrying"
  | "left";

/** Why a session is `left`: none of these is retried automatically. */
export type SessionEndReason =
  | "left"
  | "joined-elsewhere"
  | "kicked"
  | "room-closed"
  | "auth"
  | "full"
  | "unsupported"
  | "no-service";

export interface SessionState {
  readonly status: SessionStatus;
  /** Failed attempts since a connection last held for a while (30 s). */
  readonly attempt: number;
  /** Epoch milliseconds of the next try while `retrying`. */
  readonly nextRetryAt: number | null;
  readonly reason: SessionEndReason | null;
}

export interface MediaPermissions {
  readonly audio: boolean;
  readonly video: boolean;
}

export interface ParticipantState {
  readonly id: ParticipantId;
  /** From the Foundry user, never from the service. */
  readonly name: string;
  readonly color: string | null;
  readonly avatar: string | null;
  readonly isGM: boolean;
  readonly isLocal: boolean;
  /** Logged in to Foundry. */
  readonly active: boolean;
  /** Present in the call. */
  readonly connected: boolean;
  /** A track arrived and this client is allowed to play it. */
  readonly hasAudio: boolean;
  readonly hasVideo: boolean;
  readonly speaking: boolean;
  /** Self-reported through Foundry. */
  readonly muted: boolean;
  readonly hidden: boolean;
  readonly deafened: boolean;
  /** Foundry's `BROADCAST_AUDIO` / `BROADCAST_VIDEO`, set by GMs. */
  readonly canBroadcast: MediaPermissions;
  /** This client's playback volume for them, 0 to 1. */
  readonly volume: number;
}

export type VoiceMode = "always" | "activity" | "ptt";

/**
 * Why the camera is kept off although the player wants it on: its effect
 * isn't running yet, stopped sending frames, or failed (or can't run in
 * this browser). Raw video is never sent instead.
 */
export type CameraHold = "effect-starting" | "effect-stalled" | "effect-failed";

/** Where an effect stands on this client. */
export type EffectStatus =
  "off" | "starting" | "running" | "failed" | "unsupported";

export interface EffectState {
  readonly status: EffectStatus;
  /** Why it failed: the error's name, e.g. "NotSupportedError". */
  readonly error: string | null;
}

export interface LocalState {
  readonly muted: boolean;
  readonly videoEnabled: boolean;
  readonly deafened: boolean;
  /**
   * Whether the microphone is sent right now: in voice activity mode, while
   * the gate is open.
   */
  readonly broadcasting: boolean;
  readonly voiceMode: VoiceMode;
  /** The world's A/V mode and the GM's permissions combined. */
  readonly canPublish: MediaPermissions;
  /** A device was acquired. */
  readonly hasMicrophone: boolean;
  readonly hasCamera: boolean;
  /** Why a device couldn't be used: the DOMException name ("NotAllowedError"). */
  readonly microphoneError: string | null;
  readonly cameraError: string | null;
  /** Voice activity mode, but the gate can't run: everything is sent. */
  readonly openMic: boolean;
  /** Muted or deafened, and the microphone hears sustained speech. */
  readonly speakingWhileMuted: boolean;
}

export interface ServiceState {
  readonly id: string | null;
  readonly capabilities: ServiceCapabilities | null;
}

export interface AVState {
  readonly session: SessionState;
  readonly participants: Readonly<Record<ParticipantId, ParticipantState>>;
  readonly local: LocalState;
  readonly service: ServiceState;
}
