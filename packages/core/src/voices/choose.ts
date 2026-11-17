import type {
  AVCommands,
  AVState,
  Store,
  VoiceConsentChoice,
} from "@modular-av/api";
import type { FoundryGame, FoundryNamespace } from "../foundry/globals.ts";
import { foundryDialogs } from "./dialogs.ts";
import { CHOICES, voiceKey } from "./flags.ts";

const FORGET = "forget";

export interface ChooseDeps {
  readonly game: FoundryGame;
  readonly DialogV2: FoundryNamespace["applications"]["api"]["DialogV2"];
  readonly store: Store<AVState>;
  readonly commands: Pick<
    AVCommands,
    "setVoiceConsent" | "forgetVoiceDecisions"
  >;
}

const isChoice = (value: unknown): value is VoiceConsentChoice =>
  CHOICES.some((c) => c === value);

/** Asks for the choice, or to forget the answers, in one dialog. */
export async function chooseConsent(deps: ChooseDeps): Promise<void> {
  const { i18n } = deps.game;
  const current = deps.store.get().voiceConsent.choice;
  const action = await foundryDialogs(deps.DialogV2).choose({
    title: i18n.localize(voiceKey("settings.label")),
    content: i18n.format(voiceKey("settings.now"), {
      choice: i18n.localize(voiceKey(`choice.${current}`)),
    }),
    buttons: [...CHOICES, FORGET].map((action) => ({
      action,
      label: i18n.localize(
        voiceKey(action === FORGET ? "settings.forget" : `choice.${action}`),
      ),
    })),
  });
  if (action === FORGET) await deps.commands.forgetVoiceDecisions();
  else if (isChoice(action)) await deps.commands.setVoiceConsent(action);
}
