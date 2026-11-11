import type {
  ParticipantId,
  PublishRights,
  ScreenShareRule,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { AVFacts } from "../foundry/av-facts.ts";
import type { FoundryGame } from "../foundry/globals.ts";

/** Who may share a screen: a world setting, shown in Foundry's settings. */
export const SCREEN_SHARE_SETTING = "screenShare";

const RULES: readonly ScreenShareRule[] = ["video", "gm", "nobody"];
const DEFAULT_RULE: ScreenShareRule = "video";

const isRule = (value: unknown): value is ScreenShareRule =>
  RULES.includes(value as ScreenShareRule);

export function readScreenShareRule(game: FoundryGame): ScreenShareRule {
  const value = game.settings.get(MODULE_ID, SCREEN_SHARE_SETTING);
  return isRule(value) ? value : DEFAULT_RULE;
}

/**
 * Whether the world's rule lets a user share, with the GM's video
 * permission: a share is video, and a block on video blocks it too.
 */
export function mayShareScreen(
  game: FoundryGame,
  facts: AVFacts,
  id: ParticipantId,
): boolean {
  const rule = readScreenShareRule(game);
  if (rule === "nobody" || !facts.canBroadcast(id).video) return false;
  return rule === "video" || (game.users.get(id)?.isGM ?? false);
}

/** What a user may publish: the GM's permissions and the screen rule. */
export function publishRights(
  game: FoundryGame,
  facts: AVFacts,
  id: ParticipantId,
): PublishRights {
  return { ...facts.canBroadcast(id), screen: mayShareScreen(game, facts, id) };
}

export function registerScreenShareSetting(
  game: FoundryGame,
  onChange: () => void,
): void {
  const key = `${MODULE_ID}.settings.screenShare`;
  game.settings.register(MODULE_ID, SCREEN_SHARE_SETTING, {
    name: `${key}.name`,
    hint: `${key}.hint`,
    scope: "world",
    config: true,
    type: String,
    choices: Object.fromEntries(RULES.map((r) => [r, `${key}.choices.${r}`])),
    default: DEFAULT_RULE,
    onChange,
  });
}
