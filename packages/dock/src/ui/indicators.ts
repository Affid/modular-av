import { el, icon, setLabel } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import type { Warning } from "../view/panel-view.ts";
import type { Indicator } from "../view/tile-view.ts";

export type IndicatorName = Indicator | Warning;

/** Font Awesome icons (Foundry ships Font Awesome 6). */
const ICONS: Readonly<Record<IndicatorName, string>> = {
  muted: "fa-microphone-slash",
  deafened: "fa-ear-deaf",
  "blocked-audio": "fa-comment-slash",
  "blocked-video": "fa-video-slash",
  "hidden-by-me": "fa-eye-slash",
  connection: "fa-signal",
  "not-connected": "fa-plug-circle-xmark",
  "open-mic": "fa-microphone-lines",
  "microphone-held": "fa-microphone-lines-slash",
  "speaking-while-muted": "fa-comment-dots",
  "camera-held": "fa-hourglass-half",
  "microphone-error": "fa-triangle-exclamation",
  "camera-error": "fa-triangle-exclamation",
  "effect-failed": "fa-circle-exclamation",
};

/**
 * One indicator: an icon with its meaning as the accessible name and the
 * tooltip. `data-indicator` names it (part of the UI contract).
 */
export function indicator(
  ctx: DockContext,
  doc: Document,
  name: IndicatorName,
): HTMLElement {
  const element = el("span", {
    doc,
    className: "mav-indicator",
    attrs: { "data-indicator": name, role: "img" },
    children: [icon(ICONS[name], doc)],
  });
  setLabel(element, ctx.t(`indicator.${name}`));
  return element;
}

/** Shows exactly `names` in `container`, reusing the elements already there. */
export function syncIndicators(
  ctx: DockContext,
  container: HTMLElement,
  names: readonly IndicatorName[],
): void {
  const doc = container.ownerDocument;
  const existing = new Map(
    Array.from(container.children, (child) => [
      (child as HTMLElement).dataset.indicator ?? "",
      child,
    ]),
  );
  const wanted = names.map(
    (name) => existing.get(name) ?? indicator(ctx, doc, name),
  );
  const same =
    wanted.length === container.children.length &&
    wanted.every((child, i) => container.children[i] === child);
  if (!same) container.replaceChildren(...wanted);
}
