import type {
  MediaPermissions,
  ParticipantId,
  VoiceMode,
} from "@modular-av/api";
import type { DeviceChoice } from "../media/local-media.ts";
import type { AVSettingsLike, AVUserEntry, FoundryGame } from "./globals.ts";

/** `foundry.av.AVSettings.AV_MODES`. */
export const AV_MODES = {
  DISABLED: 0,
  AUDIO: 1,
  VIDEO: 2,
  AUDIO_VIDEO: 3,
} as const;

const VOICE_MODES: readonly VoiceMode[] = ["always", "activity", "ptt"];

const NONE: MediaPermissions = { audio: false, video: false };

/**
 * What the core reads from Foundry. `AVSettings` stays the store of record
 * for everything Foundry models; this is the only place that reads it.
 */
export interface AVFacts {
  readonly selfId: ParticipantId;
  settings(): AVSettingsLike | null;
  mode(): number;
  voiceMode(): VoiceMode;
  /** What the world's mode allows at all. */
  modeAllows(): MediaPermissions;
  /** The GM's `BROADCAST_*` permissions combined with the mode. */
  canBroadcast(userId: ParticipantId): MediaPermissions;
  /** `core.rtcClientSettings.users.<id>` on this client. */
  entry(userId: ParticipantId): AVUserEntry;
  muteAll(): boolean;
  sinkId(): string;
  /** The devices to capture, null where the mode or Foundry wants none. */
  devices(): DeviceChoice;
}

export function createAVFacts(game: FoundryGame): AVFacts {
  const settings = (): AVSettingsLike | null => game.webrtc?.settings ?? null;
  const mode = (): number => settings()?.world.mode ?? AV_MODES.DISABLED;
  const modeAllows = (): MediaPermissions => {
    const m = mode();
    return {
      audio: m === AV_MODES.AUDIO || m === AV_MODES.AUDIO_VIDEO,
      video: m === AV_MODES.VIDEO || m === AV_MODES.AUDIO_VIDEO,
    };
  };

  return {
    selfId: game.userId,
    settings,
    mode,
    voiceMode() {
      const value = settings()?.client.voice.mode;
      return VOICE_MODES.find((m) => m === value) ?? "ptt";
    },
    modeAllows,
    canBroadcast(userId) {
      const user = game.users.get(userId);
      if (!user) return NONE;
      const allowed = modeAllows();
      return {
        audio: allowed.audio && user.can("BROADCAST_AUDIO"),
        video: allowed.video && user.can("BROADCAST_VIDEO"),
      };
    },
    entry: (userId) => settings()?.client.users[userId] ?? {},
    muteAll: () => settings()?.client.muteAll ?? false,
    sinkId: () => settings()?.client.audioSink ?? "default",
    devices() {
      const client = settings()?.client;
      const allowed = modeAllows();
      return {
        audio: allowed.audio && client?.audioSrc ? client.audioSrc : null,
        video: allowed.video && client?.videoSrc ? client.videoSrc : null,
      };
    },
  };
}
