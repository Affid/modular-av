import type {
  AudioPlace,
  AVCommands,
  DeviceKind,
  EffectDefinition,
  GateFallback,
  InputSensitivity,
  MediaPermissions,
  Registry,
  VoiceMode,
} from "@modular-av/api";
import type { Controller } from "./controller.ts";
import { AVCommandError } from "./errors.ts";
import type { AVSettingsLike, FoundryGame } from "./foundry/globals.ts";
import type * as SettingWrites from "./media/setting-writes.ts";

function avSettings(controller: Controller): AVSettingsLike {
  const settings = controller.facts.settings();
  if (!settings)
    throw new AVCommandError(
      "not-ready",
      "Voice and video are not started yet",
    );
  return settings;
}

const VOICE_MODES: readonly VoiceMode[] = ["always", "activity", "ptt"];

/** Commands return promises: a failed check rejects, never throws. */
const attempt = (run: () => void): Promise<void> => {
  try {
    run();
    return Promise.resolve();
  } catch (error: unknown) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
};

/** Loaded with the first change: the entry only reads these settings. */
const loadWrites = (): Promise<typeof SettingWrites> =>
  import("./media/setting-writes.ts");

export function createCommands(
  game: FoundryGame,
  controller: () => Controller,
  effects: Registry<EffectDefinition>,
): AVCommands {
  const self = (): string => controller().facts.selfId;

  const change = async (
    write: (writes: typeof SettingWrites) => Promise<void>,
  ): Promise<void> => {
    await write(await loadWrites());
    controller().apply();
  };

  /** Writes Foundry's client A/V settings, then applies what follows. */
  const setClient = (path: string, value: unknown): void => {
    const c = controller();
    avSettings(c).set("client", path, value);
    c.apply();
  };

  const setOwn = (key: "muted" | "hidden", value: boolean): void => {
    setClient(`users.${self()}.${key}`, value);
  };

  /** Someone else known to Foundry: own settings have their own commands. */
  const other = (participant: string): void => {
    if (!game.users.get(participant))
      throw new AVCommandError("unknown-participant", "No such player", {
        participant,
      });
    if (participant === self())
      throw new AVCommandError(
        "invalid-argument",
        "This applies to other players only",
        { participant },
      );
  };

  return Object.freeze({
    setMuted: (muted: boolean) =>
      attempt(() => {
        if (!muted && !controller().facts.canBroadcast(self()).audio)
          throw new AVCommandError("forbidden", "You may not send audio");
        setOwn("muted", muted);
      }),

    setVideoEnabled: (enabled: boolean) =>
      attempt(() => {
        if (enabled && !controller().facts.canBroadcast(self()).video)
          throw new AVCommandError("forbidden", "You may not send video");
        setOwn("hidden", !enabled);
      }),

    setDeafened: (deafened: boolean) => controller().setDeafened(deafened),

    setVolume: (participant: string, volume: number) =>
      attempt(() => {
        if (!Number.isFinite(volume) || volume < 0 || volume > 1)
          throw new AVCommandError(
            "invalid-argument",
            "Volume must be between 0 and 1",
            { volume },
          );
        if (!game.users.get(participant))
          throw new AVCommandError("unknown-participant", "No such player", {
            participant,
          });
        setClient(`users.${participant}.volume`, volume);
      }),

    setHiddenByMe: (participant: string, hidden: boolean) =>
      attempt(() => {
        other(participant);
        setClient(`users.${participant}.blocked`, hidden);
      }),

    setReceiveVideo: (enabled: boolean) =>
      attempt(() => {
        setClient("disableVideo", !enabled);
      }),

    setVoiceMode: (mode: VoiceMode) =>
      attempt(() => {
        if (!VOICE_MODES.includes(mode))
          throw new AVCommandError("invalid-argument", "No such voice mode", {
            mode,
          });
        setClient("voice.mode", mode);
      }),

    setEffectEnabled: (effect: string, enabled: boolean) =>
      controller().setEffectEnabled(effect, enabled),

    async setDevice(kind: DeviceKind, deviceId: string) {
      const { deviceKey } = await loadWrites();
      const key = deviceKey(kind, deviceId);
      const c = controller();
      avSettings(c).set("client", key, deviceId);
      if (kind === "audioOutput") c.apply();
      else await c.reacquire();
    },

    setInputSensitivity: (sensitivity: Partial<InputSensitivity>) =>
      change((w) => w.writeSensitivity(game, sensitivity)),

    setCutTails: (cut: boolean) => change((w) => w.writeCutTails(game, cut)),

    setChannelLevel: (level: number) =>
      change((w) => w.writeChannelLevel(game, level)),

    setAudioEffectMix: (effect: string, mix: number) =>
      change((w) => w.writeEffectMix(game, effects, effect, mix)),

    setAudioEffectPlace: (effect: string, place: AudioPlace) =>
      change((w) => w.writeEffectPlace(game, effects, effect, place)),

    setAudioEffectOrder: (place: AudioPlace, ids: readonly string[]) =>
      change((w) => w.writeEffectOrder(game, effects, place, ids)),

    setGateFallback: (fallback: GateFallback) =>
      change((w) => w.writeGateFallback(game, fallback)),

    leave: () => controller().session.stop("left"),

    rejoin: () =>
      attempt(() => {
        const { session } = controller();
        if (session.state.status === "left") session.start();
      }),

    reconnectNow: () =>
      attempt(() => {
        controller().session.retryNow();
      }),

    async setBroadcastPermissions(
      participant: string,
      permissions: Partial<MediaPermissions>,
    ) {
      const { writeBroadcastPermissions } = await loadWrites();
      await writeBroadcastPermissions(game, participant, permissions);
    },
  });
}
