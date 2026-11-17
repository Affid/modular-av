import type { AVState } from "@modular-av/api";
import { el, icon, setLabel } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { myCopies, type VoiceLine, voiceLine } from "../view/voice-view.ts";

export interface YourVoice {
  readonly element: HTMLButtonElement;
  dispose(): void;
}

/**
 * The voice panel's line while a module asks for the player's voice:
 * "Transcriber wants your voice", standing out until they answer. Only
 * the module's title is cut short. It opens the list of those modules.
 */
export function createYourVoice(
  ctx: DockContext,
  doc: Document,
  open: (anchor: HTMLElement) => void,
): YourVoice {
  const spans = [0, 1, 2].map((i) =>
    el("span", {
      doc,
      className: i === 1 ? "mav-dock-voices-title" : "mav-dock-voices-text",
    }),
  );
  const ear = el("span", { doc, className: "mav-dock-voices-icon" });
  const element = el("button", {
    doc,
    className: "mav-dock-voices",
    attrs: { type: "button", "aria-haspopup": "dialog" },
    children: [ear, ...spans],
  });
  element.addEventListener("click", () => {
    open(element);
  });
  const lineOf = (state: AVState): VoiceLine | null => {
    const mine = myCopies(state, ctx.selfId);
    return mine.length === 0 ? null : voiceLine(ctx.t, state, ctx.selfId, mine);
  };
  let shown = "";
  const render = (line: VoiceLine | null): void => {
    element.hidden = line === null;
    if (!line) return;
    element.dataset.state = line.state;
    line.parts.forEach((part, i) => {
      const span = spans[i];
      if (span) span.textContent = part;
    });
    const glyph = line.state === "refused" ? "fa-ear-deaf" : "fa-ear-listen";
    if (glyph !== shown) ear.replaceChildren(icon(glyph, doc));
    shown = glyph;
    // Titles and names are other people's words: plain text only.
    setLabel(element, line.label, { trusted: false });
  };
  render(lineOf(ctx.api.state.get()));
  const off = ctx.api.state.subscribe(lineOf, render, {
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  return { element, dispose: off };
}
