import type {
  AVCommands,
  AVState,
  Contribution,
  Store,
  VoiceConsentChoice,
} from "@modular-av/api";
import { MODULE_ID } from "../constants.ts";
import type { ChooseDeps } from "./choose.ts";
import { CHOICES, voiceKey } from "./flags.ts";

export const VOICES_MENU = "voices";

const isChoice = (value: unknown): value is VoiceConsentChoice =>
  CHOICES.some((c) => c === value);

/** The choice and "forget my answers" in a settings window's Call tab. */
export function voiceConsentSection(
  store: Store<AVState>,
  commands: Pick<AVCommands, "setVoiceConsent">,
  /** Asks first, then forgets every answer. */
  forget: () => Promise<void>,
): Contribution {
  return {
    kind: "settings-section",
    id: `${MODULE_ID}.voices`,
    label: voiceKey("settings.label"),
    icon: "fa-solid fa-ear-listen",
    tab: "call",
    settings: [],
    controls: [
      {
        type: "choice",
        id: `${MODULE_ID}.voices.choice`,
        label: voiceKey("settings.choice"),
        options: CHOICES.map((value) => ({
          value,
          label: voiceKey(`choice.${value}`),
        })),
        state: {
          get: () => store.get().voiceConsent.choice,
          subscribe: (listener) =>
            store.subscribe((s) => s.voiceConsent.choice, listener),
        },
        set: (value) =>
          isChoice(value)
            ? commands.setVoiceConsent(value)
            : Promise.reject(new Error(`No such choice "${value}"`)),
      },
      {
        type: "button",
        id: `${MODULE_ID}.voices.forget`,
        label: voiceKey("settings.forget"),
        run: forget,
      },
    ],
  };
}

/** The confirmation's code loads when a player first asks to forget. */
export const confirmForgetting = (deps: ChooseDeps) => (): Promise<void> =>
  import("./choose.ts").then(({ confirmForget }) => confirmForget(deps));

export interface VoicesMenuDeps extends ChooseDeps {
  /** Foundry's ApplicationV2: a settings menu's type must extend it. */
  readonly base: abstract new (...args: never[]) => object;
  readonly onError: (error: unknown) => void;
}

/**
 * Foundry's module settings get a button for it, with or without a UI
 * module. Its dialog loads when the button is first pressed.
 */
export function registerVoicesMenu(deps: VoicesMenuDeps): void {
  const Base = deps.base as unknown as new () => {
    render(options?: object): unknown;
  };
  class ChooseVoiceConsent extends Base {
    override render(): Promise<this> {
      import("./choose.ts")
        .then(({ chooseConsent }) => chooseConsent(deps))
        .catch(deps.onError);
      return Promise.resolve(this);
    }
  }
  deps.game.settings.registerMenu(MODULE_ID, VOICES_MENU, {
    name: voiceKey("menu.name"),
    label: voiceKey("menu.label"),
    hint: voiceKey("menu.hint"),
    icon: "fa-solid fa-ear-listen",
    type: ChooseVoiceConsent,
    restricted: false,
  });
}
