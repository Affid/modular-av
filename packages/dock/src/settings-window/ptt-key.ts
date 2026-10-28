import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import type { Draft } from "./draft.ts";
import { row } from "./fields.ts";

/**
 * Push to talk's key, set in place: click, then press the key (Escape
 * cancels). It is Foundry's own binding, the one its Controls show.
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
  const take = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    doc.removeEventListener("keydown", take, true);
    listening = false;
    if (event.key === "Escape") render();
    else draft.set("pttKey", event.code);
  };
  button.addEventListener("click", () => {
    if (listening) return;
    listening = true;
    render();
    doc.addEventListener("keydown", take, true);
  });
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
