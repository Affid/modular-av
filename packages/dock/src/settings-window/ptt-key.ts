import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import type { Draft } from "./draft.ts";
import { row } from "./fields.ts";

/** Keys that only modify another: pressed alone, capture goes on. */
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

/**
 * Push to talk's key, set in place: click, then press the key. Escape
 * cancels, as does leaving the button; Tab moves on as usual. It is
 * Foundry's own binding, the one its Controls show.
 */
export function pushToTalkKey(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
): Rendered {
  const button = el("button", {
    doc,
    className: "mav-control-button mav-key",
    attrs: { type: "button", "data-field": "pttKey" },
  });
  let listening = false;
  const render = (): void => {
    const key = draft.get("pttKey");
    button.toggleAttribute("data-listening", listening);
    button.replaceChildren(
      listening
        ? ctx.t("settings.pressKey")
        : el("kbd", { doc, text: key || ctx.t("settings.noKey") }),
    );
  };
  const stop = (): void => {
    if (!listening) return;
    listening = false;
    doc.removeEventListener("keydown", take, true);
    render();
  };
  function take(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      stop();
      return;
    }
    if (MODIFIERS.has(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const code = event.key === "Escape" ? "" : event.code;
    stop();
    if (code && code !== "Unidentified") draft.set("pttKey", code);
  }
  button.addEventListener("click", () => {
    if (listening) return;
    listening = true;
    render();
    doc.addEventListener("keydown", take, true);
  });
  button.addEventListener("blur", stop);
  render();
  const off = draft.subscribe(render);
  return {
    element: row(
      doc,
      ctx.t("settings.pushToTalkKeyLabel"),
      button,
      ctx.t("settings.pushToTalkHint"),
    ),
    dispose() {
      off();
      doc.removeEventListener("keydown", take, true);
    },
  };
}
