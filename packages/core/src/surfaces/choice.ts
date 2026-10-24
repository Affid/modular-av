import type { SurfaceDefinition, SurfaceKind } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** The world's choice of what shows the cameras. */
export const CAMERAS_SETTING = "cameras";
/** A player's own choice, over the world's. */
export const PLAYER_CAMERAS_SETTING = "camerasPlayer";
/** The world's choice of settings window. */
export const SETTINGS_WINDOW_SETTING = "settingsWindow";

/** Foundry's own dock or settings window. */
export const FOUNDRY = "foundry";
/** A player who keeps the world's choice. */
const AS_WORLD = "";

const key = (name: string): string => `${MODULE_ID}.settings.${name}`;

type Of<K extends SurfaceKind> = Extract<SurfaceDefinition, { kind: K }>;

const ofKind = <K extends SurfaceKind>(
  surfaces: readonly SurfaceDefinition[],
  kind: K,
): readonly Of<K>[] => surfaces.filter((s): s is Of<K> => s.kind === kind);

const choices = (
  surfaces: readonly SurfaceDefinition[],
  foundryLabel: string,
): Record<string, string> => ({
  [FOUNDRY]: key(foundryLabel),
  ...Object.fromEntries(surfaces.map((s) => [s.id, s.label])),
});

/** At `setup`, once the surfaces are registered. Changes need a reload. */
export function registerSurfaceSettings(
  game: FoundryGame,
  surfaces: readonly SurfaceDefinition[],
): void {
  const cameras = ofKind(surfaces, "cameras");
  const windows = ofKind(surfaces, "settings");
  const camerasChoices = choices(cameras, "choices.foundryDock");
  game.settings.register(MODULE_ID, CAMERAS_SETTING, {
    name: key("cameras.name"),
    hint: key("cameras.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: camerasChoices,
    default: cameras[0]?.id ?? FOUNDRY,
    requiresReload: true,
  });
  game.settings.register(MODULE_ID, PLAYER_CAMERAS_SETTING, {
    name: key("camerasPlayer.name"),
    hint: key("camerasPlayer.hint"),
    scope: "user",
    config: true,
    type: String,
    choices: { [AS_WORLD]: key("choices.asWorld"), ...camerasChoices },
    default: AS_WORLD,
    requiresReload: true,
  });
  game.settings.register(MODULE_ID, SETTINGS_WINDOW_SETTING, {
    name: key("settingsWindow.name"),
    hint: key("settingsWindow.hint"),
    scope: "world",
    config: true,
    type: String,
    choices: choices(windows, "choices.foundrySettings"),
    default: windows[0]?.id ?? FOUNDRY,
    requiresReload: true,
  });
}

const read = (game: FoundryGame, setting: string): string => {
  const value = game.settings.get(MODULE_ID, setting);
  return typeof value === "string" ? value : AS_WORLD;
};

/**
 * The surface this client uses for `kind`, or null for Foundry's own. A
 * choice naming a surface that isn't registered (its module was turned
 * off) falls back to Foundry's.
 */
export function chosenSurface<K extends "cameras" | "settings">(
  game: FoundryGame,
  surfaces: readonly SurfaceDefinition[],
  kind: K,
): Of<K> | null {
  const world = read(
    game,
    kind === "cameras" ? CAMERAS_SETTING : SETTINGS_WINDOW_SETTING,
  );
  const own = kind === "cameras" ? read(game, PLAYER_CAMERAS_SETTING) : "";
  const id = own === AS_WORLD ? world : own;
  const isChosen = (s: SurfaceDefinition): boolean => s.id === id;
  return ofKind(surfaces, kind).find(isChosen) ?? null;
}

export const playersSurfaces = (
  surfaces: readonly SurfaceDefinition[],
): readonly Of<"players">[] => ofKind(surfaces, "players");
