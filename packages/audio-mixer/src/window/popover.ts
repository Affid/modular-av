import { el, uniqueId } from "@modular-av/kit";
import type { MixerContext } from "./context.ts";

/** Below this window width a pop-over spans the window, as a sheet. */
const SHEET_BELOW_PX = 640;
const GAP_PX = 4;

export interface PopContent {
  readonly element: HTMLElement;
  /** What gets focus once it opens; its first control otherwise. */
  readonly focus?: HTMLElement;
  dispose(): void;
}

export interface Pop {
  readonly kind: string;
  /** The card or slot it belongs to. */
  readonly key: string;
  readonly element: HTMLElement;
  close(returnFocus: boolean): void;
}

export interface PopSpec {
  readonly kind: string;
  readonly key: string;
  readonly title: string;
  readonly anchor: HTMLElement;
  build(close: () => void): PopContent;
  onClosed(): void;
}

function place(root: HTMLElement, pop: HTMLElement, anchor: HTMLElement): void {
  const box = root.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const sheet = root.clientWidth > 0 && root.clientWidth < SHEET_BELOW_PX;
  pop.toggleAttribute("data-sheet", sheet);
  const top = at.bottom - box.top + root.scrollTop + GAP_PX;
  pop.style.top = `${String(Math.max(0, top))}px`;
  if (sheet) {
    pop.style.left = "0px";
    return;
  }
  const room = root.clientWidth - pop.offsetWidth;
  const left = Math.min(Math.max(0, at.left - box.left), Math.max(0, room));
  pop.style.left = `${String(left)}px`;
}

const firstControl = (element: HTMLElement): HTMLElement | null =>
  element.querySelector<HTMLElement>(
    "input:not([disabled]), select:not([disabled]), button:not([disabled])",
  );

/**
 * A dialog over the window, under its anchor, that doesn't block the rest:
 * Escape or a press outside closes it, and Escape gives focus back.
 */
export function openPop(
  ctx: Pick<MixerContext, "t">,
  doc: Document,
  root: HTMLElement,
  spec: PopSpec,
): Pop {
  const titleId = uniqueId(doc, "mav-mixer-pop");
  let content: PopContent | null = null;
  let open = true;
  const closeButton = el("button", {
    doc,
    className: "mav-mixer-pop-close",
    text: "×",
    attrs: { type: "button", "aria-label": ctx.t("close") },
  });
  const element = el("div", {
    doc,
    className: "mav-mixer-pop",
    attrs: {
      role: "dialog",
      "aria-labelledby": titleId,
      "data-pop": spec.kind,
      "data-key": spec.key,
    },
  });
  const onOutside = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && (element.contains(target) || spec.anchor.contains(target)))
      return;
    close(false);
  };
  function close(returnFocus: boolean): void {
    if (!open) return;
    open = false;
    doc.removeEventListener("pointerdown", onOutside, true);
    content?.dispose();
    element.remove();
    if (returnFocus && spec.anchor.isConnected) spec.anchor.focus();
    spec.onClosed();
  }
  content = spec.build(() => {
    close(true);
  });
  element.append(
    el("header", {
      doc,
      className: "mav-mixer-pop-head",
      children: [
        el("h4", { doc, text: spec.title, attrs: { id: titleId } }),
        closeButton,
      ],
    }),
    content.element,
  );
  closeButton.addEventListener("click", () => {
    close(true);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close(true);
  });
  root.append(element);
  place(root, element, spec.anchor);
  doc.addEventListener("pointerdown", onOutside, true);
  (content.focus ?? firstControl(content.element) ?? closeButton).focus();
  return { kind: spec.kind, key: spec.key, element, close };
}
