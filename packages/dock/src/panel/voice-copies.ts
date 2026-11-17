import type { AVState, VoiceCopyConsent } from "@modular-av/api";
import { el, icon, openPopover, type Popover, uniqueId } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";
import {
  myCopies,
  type MyCopy,
  sourcesText,
  whereText,
} from "../view/voice-view.ts";

const STATUS_ICONS: Readonly<Record<VoiceCopyConsent, string>> = {
  asking: "fa-circle-question",
  allowed: "fa-ear-listen",
  refused: "fa-ear-deaf",
};

const sameCopy =
  ({ copy }: MyCopy) =>
  (other: MyCopy): boolean =>
    other.copy.receiver === copy.receiver &&
    other.copy.moduleId === copy.moduleId;

interface Shared {
  readonly ctx: DockContext;
  readonly doc: Document;
  readonly alerts: HTMLElement;
  /** Says an answer was taken, politely, for screen readers. */
  readonly announce: (text: string) => void;
}

/** Allow | Refuse: the pressed one is the answer; none while waiting. */
function answers(
  { ctx, doc, alerts, announce }: Shared,
  mine: MyCopy,
  consent: () => VoiceCopyConsent,
): { readonly element: HTMLElement; show(now: VoiceCopyConsent): void } {
  const button = (allow: boolean): HTMLButtonElement => {
    const element = el("button", {
      doc,
      className: allow ? "mav-effect-choice" : "mav-effect-choice mav-voice-no",
      attrs: { type: "button", "aria-pressed": "false" },
    });
    element.addEventListener("click", () => {
      const wanted = allow ? "allowed" : "refused";
      if (consent() === wanted) return;
      const { moduleId, receiver, title } = mine.copy;
      run(ctx, alerts, async () => {
        await ctx.api.commands.decideVoiceCopy(moduleId, receiver, allow);
        const what = sourcesText(ctx.t, mine.target.sources);
        announce(ctx.t(`voices.answered.${wanted}`, { module: title, what }));
      });
    });
    return element;
  };
  const pair = [button(true), button(false)] as const;
  const show = (now: VoiceCopyConsent): void => {
    pair.forEach((b, i) => {
      const pressed = now === (i === 0 ? "allowed" : "refused");
      b.setAttribute("aria-pressed", String(pressed));
      const mark = i === 0 ? "fa-check" : "fa-xmark";
      b.replaceChildren(
        ...(pressed ? [icon(mark, doc)] : []),
        ctx.t(i === 0 ? "voices.allow" : "voices.refuse"),
      );
    });
  };
  const element = el("div", {
    doc,
    className: "mav-effect-choices",
    children: [...pair],
  });
  return { element, show };
}

/** One module: its title, where it stands, what that means, the answers. */
function item(shared: Shared, mine: MyCopy): Rendered {
  const { ctx, doc } = shared;
  const consentIn = (s: AVState): VoiceCopyConsent =>
    myCopies(s, ctx.selfId).find(sameCopy(mine))?.target.consent ??
    mine.target.consent;
  const consent = (): VoiceCopyConsent => consentIn(ctx.api.state.get());
  const title = el("strong", {
    doc,
    className: "mav-voice-copy-title",
    attrs: { id: uniqueId(doc, "mav-voice-copy"), title: mine.copy.title },
    text: mine.copy.title,
  });
  const status = el("span", {
    doc,
    className: "mav-voice-copy-status",
    attrs: { id: uniqueId(doc, "mav-voice-status") },
  });
  const detail = el("p", {
    doc,
    className: "mav-voice-copy-detail",
    attrs: { id: uniqueId(doc, "mav-voice-detail") },
  });
  const pair = answers(shared, mine, consent);
  const group = el("div", {
    doc,
    className: "mav-dock-voice-copy",
    attrs: {
      role: "group",
      "aria-labelledby": title.id,
      "aria-describedby": `${status.id} ${detail.id}`,
      "data-voice-copy": `${mine.copy.receiver} ${mine.copy.moduleId}`,
    },
    children: [
      el("div", {
        doc,
        className: "mav-voice-copy-head",
        children: [title, status],
      }),
      detail,
      pair.element,
    ],
  });
  const show = (now: VoiceCopyConsent): void => {
    status.dataset.state = now;
    group.dataset.state = now;
    status.replaceChildren(
      icon(STATUS_ICONS[now], doc),
      ctx.t(`voices.status.${now}`),
    );
    const where = whereText(
      ctx.t,
      ctx.api.state.get(),
      ctx.selfId,
      mine.copy.receiver,
    );
    const what = sourcesText(ctx.t, mine.target.sources);
    detail.textContent = `${where} ${ctx.t(`voices.detail.${now}`, { what })}`;
    pair.show(now);
  };
  show(consent());
  const off = ctx.api.state.subscribe(consentIn, show);
  return { element: group, dispose: off };
}

/** "For modules you haven't answered: Ask me [Change]". */
function footer({ ctx, doc }: Shared): Rendered {
  const text = el("p", { doc, className: "mav-voice-default" });
  const show = (choice: string): void => {
    text.textContent = ctx.t("voices.default", {
      choice: ctx.t(`voices.choice.${choice}`),
    });
  };
  show(ctx.api.state.get().voiceConsent.choice);
  const off = ctx.api.state.subscribe((s) => s.voiceConsent.choice, show);
  const change = el("button", {
    doc,
    className: "mav-control-button",
    attrs: { type: "button" },
    text: ctx.t("voices.change"),
  });
  change.addEventListener("click", () => {
    ctx.openSettings();
  });
  const element = el("div", {
    doc,
    className: "mav-voice-footer",
    children: [text, change],
  });
  return { element, dispose: off };
}

/** Which modules asked, not how they stand: a row follows that itself. */
const membership = (ctx: DockContext) => (s: AVState) =>
  myCopies(s, ctx.selfId)
    .map((m) => `${m.copy.receiver}\n${m.copy.moduleId}\n${m.copy.title}`)
    .join("\n\n");

/**
 * Every module that asked for the player's voice, unanswered first, each
 * answered with Allow or Refuse; then what the rest get, and where to
 * change that. Closes when nothing asks any more.
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
  const said = el("p", {
    doc,
    className: "mav-sr-only",
    attrs: { role: "status" },
  });
  const shared: Shared = {
    ...{ ctx, doc, alerts },
    announce: (text) => {
      said.textContent = text;
    },
  };
  const list = el("div", { doc, className: "mav-dock-voice-list" });
  let items: readonly Rendered[] = [];
  let popover: Popover | null = null;
  const draw = (): void => {
    for (const i of items) i.dispose();
    const mine = myCopies(ctx.api.state.get(), ctx.selfId);
    items = mine.map((m) => item(shared, m));
    list.replaceChildren(...items.map((i) => i.element));
    // Nothing asks any more: the line it opened from is gone too.
    if (mine.length === 0) closeAndRefocus(popover, anchor);
  };
  draw();
  const off = ctx.api.state.subscribe(membership(ctx), draw);
  const end = footer(shared);
  const title = ctx.t("voices.title");
  popover = openPopover({
    anchor,
    content: el("div", {
      doc,
      className: "mav-dock-voice-copies",
      children: [
        el("h2", { doc, text: title }),
        list,
        end.element,
        said,
        alerts,
      ],
    }),
    label: title,
    onClose() {
      off();
      for (const i of [...items, end]) i.dispose();
    },
  });
  return popover;
}

/** The line is hidden now: the focus goes to the panel's first button. */
function closeAndRefocus(popover: Popover | null, anchor: HTMLElement): void {
  if (!popover) return;
  const hadFocus = popover.element.contains(anchor.ownerDocument.activeElement);
  popover.close();
  if (!hadFocus) return;
  anchor
    .closest(".mav-dock-panel")
    ?.querySelector<HTMLElement>("button:not([hidden])")
    ?.focus({ preventScroll: true });
}
