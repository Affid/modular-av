/**
 * Moves what a browser kept as device settings to the player, once: only
 * where the player has nothing saved yet, so the first browser to load
 * after an update brings its setup and the others take the player's. A
 * lazy chunk, loaded when the game is ready.
 */
import type { EffectDefinition, Registry } from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { AVSettingsLike, FoundryGame } from "../foundry/globals.ts";
import {
  AUDIO_EFFECTS_SETTING,
  EFFECTS_SETTING,
} from "../media/effect-choices.ts";
import {
  restoreVolumes,
  VOLUMES_SETTING,
  type Volumes,
} from "../media/volumes.ts";
import type { CoreModuleSettings } from "./module-settings.ts";

interface ClientStorage {
  getItem(key: string): unknown;
}

interface UserStorage {
  getSetting(key: string, user: string): unknown;
}

const storage = (game: FoundryGame, scope: string): unknown =>
  game.settings.storage?.get(scope);

/** What this browser's localStorage holds for a setting; undefined if nothing. */
function browserValue(game: FoundryGame, id: string): unknown {
  const client = storage(game, "client") as Partial<ClientStorage> | undefined;
  const raw = client?.getItem?.(id);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Whether the player has a value saved on the server for this setting. */
function playerSaved(game: FoundryGame, id: string): boolean {
  const user = storage(game, "user") as Partial<UserStorage> | undefined;
  return (user?.getSetting?.(id, game.userId) ?? undefined) !== undefined;
}

async function moveGeneric(
  game: FoundryGame,
  settings: CoreModuleSettings,
): Promise<void> {
  for (const id of settings.playerSettings()) {
    if (playerSaved(game, id)) continue;
    const value = browserValue(game, id);
    if (value === undefined) continue;
    const dot = id.indexOf(".");
    await settings.set(id.slice(0, dot), id.slice(dot + 1), value);
  }
}

/** The effect list used to hold both kinds: its audio ones are the player's. */
async function moveAudioChoices(
  game: FoundryGame,
  settings: CoreModuleSettings,
  effects: Pick<Registry<EffectDefinition>, "get">,
): Promise<void> {
  if (playerSaved(game, `${MODULE_ID}.${AUDIO_EFFECTS_SETTING}`)) return;
  const old: unknown = game.settings.get(MODULE_ID, EFFECTS_SETTING);
  if (!Array.isArray(old)) return;
  const audio = old.filter(
    (id): id is string =>
      typeof id === "string" && effects.get(id)?.kind === "audio",
  );
  if (audio.length > 0)
    await settings.set(MODULE_ID, AUDIO_EFFECTS_SETTING, audio);
}

/** Volumes live in Foundry's own client settings: copied to the player. */
async function moveVolumes(
  game: FoundryGame,
  settings: CoreModuleSettings,
  av: AVSettingsLike | null,
): Promise<void> {
  if (!av || playerSaved(game, `${MODULE_ID}.${VOLUMES_SETTING}`)) return;
  const volumes: Volumes = Object.fromEntries(
    Object.entries(av.client.users).flatMap(([id, entry]) =>
      typeof entry?.volume === "number" ? [[id, entry.volume]] : [],
    ),
  );
  if (Object.keys(volumes).length > 0)
    await settings.set(MODULE_ID, VOLUMES_SETTING, volumes);
}

export interface MoveDeps {
  readonly game: FoundryGame;
  readonly settings: CoreModuleSettings;
  readonly effects: Pick<Registry<EffectDefinition>, "get">;
  readonly av: () => AVSettingsLike | null;
}

/** Then the player's volumes fill in Foundry's own, where the core plays from. */
export async function moveToPlayer(deps: MoveDeps): Promise<void> {
  await moveGeneric(deps.game, deps.settings);
  await moveAudioChoices(deps.game, deps.settings, deps.effects);
  await moveVolumes(deps.game, deps.settings, deps.av());
  const av = deps.av();
  if (av) restoreVolumes(deps.game, av);
}
