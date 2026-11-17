import type {
  AVState,
  SettingsSectionContribution,
  ToggleControl,
  VoiceCopyConsent,
} from "@modular-av/api";
import { el, openPopover, type Popover, uniqueId } from "@modular-av/kit";
import { type Rendered, renderControl } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";
import {
  myCopies,
  type MyCopy,
  nameIn,
  sourcesText,
} from "../view/voice-view.ts";

/** The core's choice and "forget my answers", shown with the list. */
const CORE_SECTION = "modular-av.voices";

const sameCopy =
  ({ copy }: MyCopy) =>
  (other: MyCopy): boolean =>
    other.copy.receiver === copy.receiver &&
    other.copy.moduleId === copy.moduleId;

/** "Transcriber, on Gamemaster's browser: your voice". */
function heading(ctx: DockContext, state: AVState, mine: MyCopy): string {
  const { copy, target } = mine;
  const where =
    copy.receiver === ctx.selfId
      ? ctx.t("voices.where.self", { module: copy.title })
      : ctx.t("voices.where.other", {
          module: copy.title,
          name: nameIn(state)(copy.receiver),
        });
  return `${where}: ${sourcesText(ctx.t, target.sources)}`;
}

/** One module that asked: what it asked for, and a switch that answers. */
function item(
  ctx: DockContext,
  doc: Document,
  mine: MyCopy,
  alerts: HTMLElement,
): Rendered {
  const consent = (s: AVState): VoiceCopyConsent =>
    myCopies(s, ctx.selfId).find(sameCopy(mine))?.target.consent ??
    mine.target.consent;
  const allow: ToggleControl = {
    type: "toggle",
    id: `voice-copy.${mine.copy.receiver}.${mine.copy.moduleId}`,
    label: ctx.t("voices.allow"),
    state: {
      get: () => ({ on: consent(ctx.api.state.get()) === "allowed" }),
      subscribe: (listener) =>
        ctx.api.state.subscribe(consent, (now) => {
          listener({ on: now === "allowed" });
        }),
    },
    set: (on) =>
      ctx.api.commands.decideVoiceCopy(
        mine.copy.moduleId,
        mine.copy.receiver,
        on,
      ),
  };
  const toggle = renderControl(ctx, doc, allow, alerts);
  const waiting = el("p", {
    doc,
    className: "mav-settings-hint",
    text: ctx.t("voices.asking"),
  });
  // Waiting, the switch would only allow: refusing gets a button.
  const refuse = el("button", {
    doc,
    className: "mav-control-button mav-voice-refuse",
    attrs: { type: "button" },
    text: ctx.t("voices.refuse"),
  });
  refuse.addEventListener("click", () => {
    run(ctx, alerts, () =>
      ctx.api.commands.decideVoiceCopy(
        mine.copy.moduleId,
        mine.copy.receiver,
        false,
      ),
    );
  });
  const showWaiting = (now: VoiceCopyConsent): void => {
    waiting.hidden = now !== "asking";
    refuse.hidden = now !== "asking";
  };
  showWaiting(consent(ctx.api.state.get()));
  const off = ctx.api.state.subscribe(consent, showWaiting);
  const name = el("p", {
    doc,
    attrs: { id: uniqueId(doc, "mav-voice-copy") },
    text: heading(ctx, ctx.api.state.get(), mine),
  });
  const element = el("div", {
    doc,
    className: "mav-dock-voice-copy",
    attrs: {
      role: "group",
      "aria-labelledby": name.id,
      "data-voice-copy": `${mine.copy.receiver} ${mine.copy.moduleId}`,
    },
    children: [name, waiting, toggle.element, refuse],
  });
  return {
    element,
    dispose() {
      off();
      toggle.dispose();
    },
  };
}

/** The core's own section for voices, if it registered one. */
function coreControls(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): readonly Rendered[] {
  const section = ctx.api.contributions
    .list()
    .find(
      (c): c is SettingsSectionContribution =>
        c.kind === "settings-section" && c.id === CORE_SECTION,
    );
  return (section?.controls ?? []).map((control) =>
    renderControl(ctx, doc, control, alerts),
  );
}

/** Which modules asked, not how they stand: a switch follows that itself. */
const membership = (ctx: DockContext) => (s: AVState) =>
  myCopies(s, ctx.selfId)
    .map((m) => heading(ctx, s, m))
    .join("\n");

/**
 * Every module that asked for the player's voice, each with a switch that
 * allows or refuses it there, then the core's choice for the rest.
 */
export function openVoiceCopies(
  ctx: DockContext,
  anchor: HTMLElement,
): Popover {
  const doc = anchor.ownerDocument;
  const alerts = el("p", {
    doc,
    className: "mav-dock-alert",
    attrs: { role: "alert" },
  });
  const list = el("div", { doc, className: "mav-dock-voice-list" });
  let items: readonly Rendered[] = [];
  let popover: Popover | null = null;
  const draw = (): void => {
    for (const i of items) i.dispose();
    const mine = myCopies(ctx.api.state.get(), ctx.selfId);
    items = mine.map((m) => item(ctx, doc, m, alerts));
    list.replaceChildren(...items.map((i) => i.element));
    // Nothing asks any more: the row it opened from is gone too.
    if (mine.length === 0) popover?.close();
    else popover?.reposition();
  };
  draw();
  const off = ctx.api.state.subscribe(membership(ctx), draw);
  const core = coreControls(ctx, doc, alerts);
  const title = ctx.t("voices.title");
  const content = el("div", {
    doc,
    className: "mav-dock-voice-copies",
    children: [
      el("h2", { doc, text: title }),
      list,
      ...core.map((c) => c.element),
      alerts,
    ],
  });
  popover = openPopover({
    anchor,
    content,
    label: title,
    onClose() {
      off();
      for (const i of [...items, ...core]) i.dispose();
    },
  });
  return popover;
}
