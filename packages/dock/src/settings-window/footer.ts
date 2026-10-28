import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";
import type { Draft } from "./draft.ts";

/** How long "Saved." stays before the line goes back to the count. */
const SAID_MS = 3000;

const RELOADS = {
  everyone: "settings.reloadsEveryone",
  self: "settings.reloadsSelf",
  none: "settings.reloadsNone",
} as const;

/** "2 unsaved changes. Saving reloads everyone's page." and the like. */
function pendingText(
  ctx: DockContext,
  count: number,
  reloads: "everyone" | "self" | null,
): string {
  if (count === 0) return ctx.t("settings.noChanges");
  const changes =
    count === 1
      ? ctx.t("settings.changesOne")
      : ctx.t("settings.changesMany", { count: String(count) });
  return `${changes} ${ctx.t(RELOADS[reloads ?? "none"])}`;
}

const footerButton = (
  doc: Document,
  action: string,
  className: string,
): HTMLButtonElement =>
  el("button", {
    doc,
    className,
    attrs: { type: "button", "data-action": action },
  });

/** The footer's line, Reset and Save, in the footer element. */
function footerParts(ctx: DockContext, doc: Document) {
  const line = el("p", {
    doc,
    className: "mav-settings-pending",
    attrs: { role: "status" },
  });
  const reset = footerButton(doc, "reset", "mav-control-button");
  reset.textContent = ctx.t("settings.reset");
  const save = footerButton(doc, "save", "mav-control-button mav-primary");
  const element = el("div", {
    doc,
    className: "mav-settings-footer",
    children: [line, reset, save],
  });
  return { line, reset, save, element };
}

/**
 * Under every tab: how many changes wait, whether saving reloads pages,
 * Reset and Save. The line is a live region: changes are announced.
 */
export function createFooter(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  alerts: HTMLElement,
): Rendered {
  const { line, reset, save, element } = footerParts(ctx, doc);
  let said: ReturnType<typeof setTimeout> | undefined;
  const render = (): void => {
    const count = draft.changed().length;
    const reloads = draft.reloads();
    const blocked = count === 0 || draft.saving();
    reset.disabled = blocked;
    save.disabled = blocked;
    save.textContent = ctx.t(reloads ? "settings.saveReload" : "settings.save");
    if (said === undefined) line.textContent = pendingText(ctx, count, reloads);
  };
  let disposed = false;
  const say = (text: string): void => {
    // A save can end after the window closed: nothing to say then.
    if (disposed) return;
    clearTimeout(said);
    line.textContent = text;
    said = setTimeout(() => {
      said = undefined;
      render();
    }, SAID_MS);
  };
  reset.addEventListener("click", () => {
    draft.reset();
    say(ctx.t("settings.discarded"));
  });
  save.addEventListener("click", () => {
    run(ctx, alerts, async () => {
      await draft.save();
      say(ctx.t("settings.saved"));
    });
  });
  render();
  const off = draft.subscribe(render);
  return {
    element,
    dispose() {
      disposed = true;
      off();
      clearTimeout(said);
    },
  };
}
