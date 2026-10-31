import type { AudioPlace } from "./effects.ts";
import type {
  DeviceKind,
  GateFallback,
  InputSensitivity,
  MediaPermissions,
  VoiceMode,
} from "./state.ts";
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
  /**
   * Neither plays nor shows another participant on this client (Foundry's
   * "hide user"); the others aren't told.
   */
  setHiddenByMe(participant: ParticipantId, hidden: boolean): Promise<void>;
  /** Shows the others' video on this client, or none of it. */
  setReceiveVideo(enabled: boolean): Promise<void>;
  /** Saved in Foundry's A/V settings. */
  setVoiceMode(mode: VoiceMode): Promise<void>;
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
  /**
   * For this device: an effect's dry:wet (`latency` declared) or the wet
   * amount of one on a send, 0 to 1. Rejects for any other effect.
   */
  setEffectMix(effect: string, mix: number): Promise<void>;
  /**
   * For this device: moves an audio effect, running or not, without
   * restarting it. Any effect may go anywhere, once: a UI should warn about a
   * `tail` ahead of the gate, which holds the gate open.
   */
  setEffectPlace(effect: string, place: AudioPlace): Promise<void>;
  /**
   * For this device: the order of `effects` within `place`. Noise suppression
   * runs first unless listed, and what isn't listed follows.
   */
  setEffectOrder(place: AudioPlace, effects: readonly string[]): Promise<void>;
  /**
   * For this device: whether a tail stops the moment the microphone closes
   * (mute, deafen, push to talk), not up to 3 s after it.
   */
  setCutTails(cut: boolean): Promise<void>;
  /**
   * For this device: how much of the voice goes out dry, 0 to 1, beside
   * what sends add. Acts as 1 while no send carries it.
   */
  setChannelLevel(level: number): Promise<void>;
  /** For this device; what isn't given stays. */
  setInputSensitivity(sensitivity: Partial<InputSensitivity>): Promise<void>;
  /** For this device: what voice activity mode does when its gate can't run. */
  setGateFallback(fallback: GateFallback): Promise<void>;
  /** Saved in Foundry's A/V settings; "default" for the system default. */
  setDevice(kind: DeviceKind, deviceId: string): Promise<void>;
  /** GM only: Foundry's `BROADCAST_AUDIO` / `BROADCAST_VIDEO`. */
  setBroadcastPermissions(
    participant: ParticipantId,
    permissions: Partial<MediaPermissions>,
  ): Promise<void>;
}
