import type {
  AVCommands,
  InputSensitivity,
  MediaPermissions,
} from "@modular-av/api";
import type { Controller } from "./controller.ts";
import { AVCommandError } from "./errors.ts";
import type { AVSettingsLike, FoundryGame } from "./foundry/globals.ts";
import { writeSensitivity } from "./media/sensitivity.ts";

function avSettings(controller: Controller): AVSettingsLike {
  const settings = controller.facts.settings();
  if (!settings)
    throw new AVCommandError(
      "not-ready",
      "Voice and video are not started yet",
    );
  return settings;
}

const PERMISSION_KEYS = {
  audio: "permissions.BROADCAST_AUDIO",
  video: "permissions.BROADCAST_VIDEO",
} as const satisfies Record<keyof MediaPermissions, string>;

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

export function createCommands(
  game: FoundryGame,
  controller: () => Controller,
): AVCommands {
  const self = (): string => controller().facts.selfId;

  const setOwn = (key: "muted" | "hidden", value: boolean): void => {
    const c = controller();
    avSettings(c).set("client", `users.${self()}.${key}`, value);
    c.apply();
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
        const c = controller();
        avSettings(c).set("client", `users.${participant}.volume`, volume);
        c.apply();
      }),

    setEffectEnabled: (effect: string, enabled: boolean) =>
      controller().setEffectEnabled(effect, enabled),

    async setInputSensitivity(sensitivity: Partial<InputSensitivity>) {
      await writeSensitivity(game, sensitivity);
      controller().apply();
    },

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
      if (!game.user.isGM)
        throw new AVCommandError("forbidden", "Only a GM may block players");
      const user = game.users.get(participant);
      if (!user)
        throw new AVCommandError("unknown-participant", "No such player", {
          participant,
        });
      const changes = Object.fromEntries(
        (Object.keys(PERMISSION_KEYS) as (keyof MediaPermissions)[])
          .filter((kind) => typeof permissions[kind] === "boolean")
          .map((kind) => [PERMISSION_KEYS[kind], permissions[kind]]),
      );
      try {
        await user.update(changes);
      } catch (error: unknown) {
        throw new AVCommandError(
          "forbidden",
          "Foundry refused to change the permissions",
          { participant },
          { cause: error },
        );
      }
    },
  });
}
