import type { FoundryNamespace } from "../foundry/globals.ts";

export interface DialogButton {
  readonly action: string;
  readonly label: string;
}

/** Foundry's DialogV2, as the voice questions need it. `content` is HTML. */
export interface VoiceDialogs {
  /** True for yes, false for no, null when closed without an answer. */
  confirm(options: {
    readonly title: string;
    readonly content: string;
    readonly yes: string;
    readonly no: string;
  }): Promise<boolean | null>;
  /** The pressed button's action, null when closed without one. */
  choose(options: {
    readonly title: string;
    readonly content: string;
    readonly buttons: readonly DialogButton[];
  }): Promise<string | null>;
}

export function foundryDialogs(
  DialogV2: FoundryNamespace["applications"]["api"]["DialogV2"],
): VoiceDialogs {
  return {
    async confirm({ title, content, yes, no }) {
      const answer = await DialogV2.confirm({
        window: { title },
        content: `<p>${content}</p>`,
        yes: { label: yes },
        no: { label: no },
      });
      return typeof answer === "boolean" ? answer : null;
    },
    async choose({ title, content, buttons }) {
      const action = await DialogV2.wait({
        window: { title },
        content: `<p>${content}</p>`,
        buttons,
      });
      return typeof action === "string" ? action : null;
    },
  };
}
