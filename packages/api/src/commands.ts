import type { MediaPermissions } from "./state.ts";
import type { ParticipantId } from "./service.ts";

export type CommandErrorCode =
  | "forbidden"
  | "invalid-argument"
  | "unknown-participant"
  | "unknown-effect"
  | "unsupported"
  | "not-ready";

/**
 * What a failed command throws. `message` is a default English text; UIs
 * may word it their own way from `code` and `params`.
 */
export interface CommandError extends Error {
  readonly code: CommandErrorCode;
  readonly params: Readonly<Record<string, string | number>>;
}

/** Everything a UI can do. Each returns once done. */
export interface AVCommands {
  setMuted(muted: boolean): Promise<void>;
  setVideoEnabled(enabled: boolean): Promise<void>;
  /** Stops all playback and the microphone; self-reported to others. */
  setDeafened(deafened: boolean): Promise<void>;
  /** This client's playback volume for a participant, 0 to 1. */
  setVolume(participant: ParticipantId, volume: number): Promise<void>;
  /** Leaves the call on purpose: no reconnecting until `rejoin`. */
  leave(): Promise<void>;
  rejoin(): Promise<void>;
  /** Skips the wait while `retrying`. */
  reconnectNow(): Promise<void>;
  /**
   * Turns an effect on or off, for this device. One turned on replaces the
   * running effect of its exclusive group once it runs; the camera is held
   * from now until a video effect runs. The effect's state tells how
   * starting went.
   */
  setEffectEnabled(effect: string, enabled: boolean): Promise<void>;
  /** GM only: Foundry's `BROADCAST_AUDIO` / `BROADCAST_VIDEO`. */
  setBroadcastPermissions(
    participant: ParticipantId,
    permissions: Partial<MediaPermissions>,
  ): Promise<void>;
}
