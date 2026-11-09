import type {
  AudioPipelineChange,
  AudioPlace,
  DeviceKind,
  EffectDefinition,
  GateFallback,
  InputSensitivity,
  MediaPermissions,
  Registry,
  VideoResolution,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import { AVCommandError } from "../errors.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import { CUT_TAILS_SETTING } from "./cut-tails.ts";
import type { EffectChoices } from "./effect-choices.ts";
import {
  EFFECT_ORDER_SETTING,
  EFFECT_PLACES_SETTING,
  isPlace,
  readPlacement,
  savedRecord,
} from "./effect-places.ts";
import { GATE_FALLBACK_SETTING, isGateFallback } from "./gate-fallback.ts";
import {
  CHANNEL_LEVEL_SETTING,
  EFFECT_MIX_SETTING,
  hasMix,
  isLevel,
  savedMix,
} from "./levels.ts";
import type { LocalMedia } from "./local-media.ts";
import {
  isThreshold,
  readSensitivity,
  SENSITIVITY_SETTING,
} from "./sensitivity.ts";
import {
  isVideoResolution,
  VIDEO_RESOLUTION_SETTING,
} from "./video-resolution.ts";

/**
 * Writes this device's voice settings, for the commands. Apart from reading
 * them so the entry stays small: this runs only when a player changes one.
 */

const checkPlace = (place: AudioPlace): void => {
  if (!isPlace(place))
    throw new AVCommandError("invalid-argument", "No such audio place", {
      place: String(place),
    });
};

const checkAudio = (effects: Registry<EffectDefinition>, id: string): void => {
  const definition = effects.get(id);
  if (!definition)
    throw new AVCommandError("unknown-effect", "No such effect", {
      effect: id,
    });
  if (definition.kind !== "audio")
    throw new AVCommandError("invalid-argument", "Not an audio effect", {
      effect: id,
    });
};

export async function writeEffectPlace(
  game: FoundryGame,
  effects: Registry<EffectDefinition>,
  id: string,
  place: AudioPlace,
): Promise<void> {
  checkAudio(effects, id);
  checkPlace(place);
  await game.settings.set(MODULE_ID, EFFECT_PLACES_SETTING, {
    ...savedRecord(game, EFFECT_PLACES_SETTING),
    [id]: place,
  });
}

const isList = (value: unknown): value is readonly string[] =>
  Array.isArray(value);

const checkOrder = (
  effects: Registry<EffectDefinition>,
  place: AudioPlace,
  ids: readonly string[],
): void => {
  checkPlace(place);
  if (!isList(ids))
    throw new AVCommandError("invalid-argument", "An order is a list");
  for (const id of ids) checkAudio(effects, id);
  if (new Set(ids).size !== ids.length)
    throw new AVCommandError("invalid-argument", "An effect is listed twice");
};

export async function writeEffectOrder(
  game: FoundryGame,
  effects: Registry<EffectDefinition>,
  place: AudioPlace,
  ids: readonly string[],
): Promise<void> {
  checkOrder(effects, place, ids);
  await game.settings.set(MODULE_ID, EFFECT_ORDER_SETTING, {
    ...savedRecord(game, EFFECT_ORDER_SETTING),
    [place]: [...ids],
  });
}

const checked = (value: number, name: string): void => {
  if (!isLevel(value))
    throw new AVCommandError(
      "invalid-argument",
      `${name} must be between 0 and 1`,
      { [name]: String(value) },
    );
};

export async function writeChannelLevel(
  game: FoundryGame,
  level: number,
): Promise<void> {
  checked(level, "level");
  await game.settings.set(MODULE_ID, CHANNEL_LEVEL_SETTING, level);
}

const checkMix = (
  effects: Registry<EffectDefinition>,
  id: string,
  mix: number,
  place: AudioPlace | undefined,
): void => {
  checked(mix, "mix");
  const definition = effects.get(id);
  if (!definition)
    throw new AVCommandError("unknown-effect", "No such effect", {
      effect: id,
    });
  if (definition.kind !== "audio" || !place || !hasMix(definition, place))
    throw new AVCommandError(
      "invalid-argument",
      "This effect has no dry:wet control",
      { effect: id },
    );
};

export async function writeEffectMix(
  game: FoundryGame,
  effects: Registry<EffectDefinition>,
  id: string,
  mix: number,
): Promise<void> {
  checkMix(effects, id, mix, readPlacement(game, effects).places[id]);
  await game.settings.set(MODULE_ID, EFFECT_MIX_SETTING, {
    ...savedMix(game),
    [id]: mix,
  });
}

/** Nothing is saved until all of it passed; the saves don't wait in between. */
export async function writeAudioPipeline(
  game: FoundryGame,
  effects: Registry<EffectDefinition>,
  change: AudioPipelineChange,
): Promise<void> {
  const given: unknown = change;
  if (typeof given !== "object" || given === null)
    throw new AVCommandError("invalid-argument", "No change was given");
  const { places, order, mix, channelLevel } = change;
  for (const [id, place] of Object.entries(places ?? {})) {
    checkAudio(effects, id);
    checkPlace(place);
  }
  for (const [place, ids] of Object.entries(order ?? {}))
    checkOrder(effects, place as AudioPlace, ids);
  if (channelLevel !== undefined) checked(channelLevel, "level");
  const placed = { ...readPlacement(game, effects).places, ...places };
  for (const [id, value] of Object.entries(mix ?? {}))
    checkMix(effects, id, value, placed[id]);

  const set = (key: string, value: unknown): Promise<unknown> =>
    game.settings.set(MODULE_ID, key, value);
  const merged = (
    key: string,
    saved: Readonly<Record<string, unknown>>,
    values: object | undefined,
  ): readonly Promise<unknown>[] =>
    values ? [set(key, { ...saved, ...values })] : [];
  await Promise.all([
    ...merged(
      EFFECT_PLACES_SETTING,
      savedRecord(game, EFFECT_PLACES_SETTING),
      places,
    ),
    ...merged(
      EFFECT_ORDER_SETTING,
      savedRecord(game, EFFECT_ORDER_SETTING),
      order,
    ),
    ...merged(EFFECT_MIX_SETTING, savedMix(game), mix),
    ...(channelLevel === undefined
      ? []
      : [set(CHANNEL_LEVEL_SETTING, channelLevel)]),
  ]);
}

/** Video effects form one group: one runs at a time. */
const groupOf = (definition: EffectDefinition): string | null =>
  definition.kind === "video" ? "video" : (definition.exclusiveGroup ?? null);

export async function writeEffectEnabled(
  choices: EffectChoices,
  local: Pick<LocalMedia, "effectStatus">,
  effects: Registry<EffectDefinition>,
  id: string,
  enabled: boolean,
): Promise<void> {
  const definition = effects.get(id);
  if (typeof enabled !== "boolean")
    throw new AVCommandError(
      "invalid-argument",
      "enabled must be true or false",
    );
  if (!definition)
    throw new AVCommandError("unknown-effect", "No such effect", {
      effect: id,
    });
  if (enabled && !choices.isSupported(definition))
    throw new AVCommandError(
      "unsupported",
      "This effect can't run in this browser",
      { effect: id },
    );
  const group = groupOf(definition);
  const others = choices.saved().filter((other) => {
    if (other === id) return false;
    if (!enabled) return true;
    const theirs = effects.get(other);
    // A running one of its group stays until it runs: never stop, then
    // start. One still starting goes, so it can't replace the newer.
    return (
      !theirs ||
      groupOf(theirs) !== group ||
      group === null ||
      local.effectStatus(other)?.status === "running"
    );
  });
  await choices.save(enabled ? [...others, id] : others);
}

export async function writeCutTails(
  game: FoundryGame,
  cut: boolean,
): Promise<void> {
  if (typeof cut !== "boolean")
    throw new AVCommandError(
      "invalid-argument",
      "The choice must be true or false",
    );
  await game.settings.set(MODULE_ID, CUT_TAILS_SETTING, cut);
}

/** Saves the choice; throws for anything but "send" or "mute". */
export async function writeGateFallback(
  game: FoundryGame,
  fallback: GateFallback,
): Promise<void> {
  if (!isGateFallback(fallback))
    throw new AVCommandError(
      "invalid-argument",
      'The fallback must be "send" or "mute"',
      { fallback: String(fallback) },
    );
  await game.settings.set(MODULE_ID, GATE_FALLBACK_SETTING, fallback);
}

/** Saves the size asked of this device's camera; throws for an unknown one. */
export async function writeVideoResolution(
  game: FoundryGame,
  resolution: VideoResolution,
): Promise<void> {
  if (!isVideoResolution(resolution))
    throw new AVCommandError("invalid-argument", "No such video resolution", {
      resolution: String(resolution),
    });
  await game.settings.set(MODULE_ID, VIDEO_RESOLUTION_SETTING, resolution);
}

/** Merges a change into the saved sensitivity; throws for bad input. */
export async function writeSensitivity(
  game: FoundryGame,
  change: Partial<InputSensitivity>,
): Promise<void> {
  if (change.auto !== undefined && typeof change.auto !== "boolean")
    throw new AVCommandError("invalid-argument", "auto must be true or false");
  if (change.threshold !== undefined && !isThreshold(change.threshold))
    throw new AVCommandError(
      "invalid-argument",
      "The threshold must be between -100 and 0 dBFS",
      { threshold: String(change.threshold) },
    );
  const current = readSensitivity(game);
  await game.settings.set(MODULE_ID, SENSITIVITY_SETTING, {
    auto: change.auto ?? current.auto,
    threshold: change.threshold ?? current.threshold,
  });
}

const PERMISSION_KEYS = {
  audio: "permissions.BROADCAST_AUDIO",
  video: "permissions.BROADCAST_VIDEO",
} as const satisfies Record<keyof MediaPermissions, string>;

export async function writeBroadcastPermissions(
  game: FoundryGame,
  participant: string,
  permissions: Partial<MediaPermissions>,
): Promise<void> {
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
}

/** Where Foundry's A/V settings keep each device choice. */
const DEVICE_KEYS = {
  audioInput: "audioSrc",
  videoInput: "videoSrc",
  audioOutput: "audioSink",
} as const satisfies Record<DeviceKind, string>;

/** Browsers' device ids are 64 hex characters; "default" is shorter. */
const MAX_DEVICE_ID = 256;

const isDeviceKind = (kind: unknown): kind is DeviceKind =>
  typeof kind === "string" && Object.hasOwn(DEVICE_KEYS, kind);

export function deviceKey(kind: DeviceKind, deviceId: string): string {
  if (!isDeviceKind(kind))
    throw new AVCommandError("invalid-argument", "No such kind of device", {
      kind: String(kind),
    });
  if (
    typeof deviceId !== "string" ||
    deviceId === "" ||
    deviceId.length > MAX_DEVICE_ID
  )
    throw new AVCommandError("invalid-argument", "A device id is needed");
  return DEVICE_KEYS[kind];
}
