import type { AVState } from "@modular-av/api";
import { el, icon, setLabel } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { myCopies, nameIn, yourVoiceLabel } from "../view/voice-view.ts";

export interface YourVoice {
  readonly element: HTMLButtonElement;
  dispose(): void;
}

/**
 * The voice panel's row while a module asks for the player's voice:
 * "Transcriber (Gamemaster) asks for your voice". It opens the list of
 * those modules, each with its switch.
 */
export function createYourVoice(
  ctx: DockContext,
  doc: Document,
  open: (anchor: HTMLElement) => void,
): YourVoice {
  const text = el("span", { doc, className: "mav-dock-voices-text" });
  const element = el("button", {
    doc,
    className: "mav-dock-voices",
    attrs: { type: "button", "aria-haspopup": "dialog" },
    children: [icon("fa-ear-listen", doc), text],
  });
  element.addEventListener("click", () => {
    open(element);
  });
  // The label, names included: a name may arrive after the module.
  const labelOf = (state: AVState): string => {
    const mine = myCopies(state, ctx.selfId);
    return mine.length === 0 ? "" : yourVoiceLabel(ctx.t, mine, nameIn(state));
  };
  const render = (label: string): void => {
    element.hidden = label === "";
    if (label === "") return;
    text.textContent = label;
    // Titles and names are other people's words: plain text only.
    setLabel(element, label, { trusted: false });
  };
  render(labelOf(ctx.api.state.get()));
  const off = ctx.api.state.subscribe(labelOf, render);
  return { element, dispose: off };
}
