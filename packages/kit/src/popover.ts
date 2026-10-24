import { el, uniqueId } from "./dom.ts";
import { placePopover } from "./position.ts";
import { viewportOf } from "./rect.ts";

export interface PopoverOptions {
  /** The control that opened it: the popover opens in its document. */
  readonly anchor: HTMLElement;
  readonly content: HTMLElement;
  /** Its accessible name, already localized. */
  readonly label: string;
  /** Runs once when it closes, however it closes. */
  readonly onClose?: () => void;
}

export interface Popover {
  readonly element: HTMLElement;
  /** After its content changed size. */
  reposition(): void;
  close(): void;
}

/** Asks an open popover to close; any UI built with the kit listens. */
const CLOSE_EVENT = "mav-popover-close";

const POPOVER = ".mav-popover";

/** Whether `node` is in `popover` or in one opened from it, at any depth. */
function within(popover: HTMLElement, node: Node): boolean {
  let current = (node as Partial<Element>).closest?.(POPOVER) ?? null;
  while (current) {
    if (current === popover) return true;
    const from = (current as HTMLElement).dataset.mavFrom;
    current = from ? popover.ownerDocument.getElementById(from) : null;
  }
  return false;
}

/** The browser's top layer: above every Foundry window, no z-index fights. */
const hasPopoverApi = (element: HTMLElement): boolean =>
  typeof element.showPopover === "function";

/**
 * Opens `content` next to `anchor`, in the anchor's document (the
 * Picture-in-Picture window, maybe), sized to that window. It closes on
 * Escape, on a click outside and through `close()`, then gives the focus
 * back to the anchor. One is open per document at a time, whichever UI
 * module opened it, except those it is opened from. Native popovers
 * (`popover="manual"`, the top layer) where the browser has them; the
 * closing rules are this helper's, the same everywhere (an "auto" one would
 * close on the press of its own anchor and reopen on its click).
 */
export function openPopover(options: PopoverOptions): Popover {
  const { anchor, content } = options;
  const doc = anchor.ownerDocument;
  const parent = anchor.closest<HTMLElement>(POPOVER);
  const element = el("div", {
    doc,
    className: "mav-popover",
    attrs: {
      id: uniqueId(doc, "mav-popover"),
      role: "dialog",
      "aria-label": options.label,
      ...(parent ? { "data-mav-from": parent.id } : {}),
    },
    children: [content],
  });
  let open = true;

  const reposition = (): void => {
    const rect = element.getBoundingClientRect();
    const place = placePopover({
      anchor: anchor.getBoundingClientRect(),
      size: { width: rect.width, height: rect.height },
      viewport: viewportOf(anchor),
    });
    element.style.left = `${String(place.left)}px`;
    element.style.top = `${String(place.top)}px`;
    element.style.setProperty("--mav-popover-room", `${String(place.room)}px`);
    element.dataset.side = place.side;
  };

  const close = (): void => {
    if (!open) return;
    open = false;
    element.removeEventListener(CLOSE_EVENT, close);
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    for (const child of doc.querySelectorAll<HTMLElement>(POPOVER))
      if (child.dataset.mavFrom === element.id)
        child.dispatchEvent(new Event(CLOSE_EVENT));
    const hadFocus = element.contains(doc.activeElement);
    if (hasPopoverApi(element) && element.matches(":popover-open"))
      element.hidePopover();
    element.remove();
    anchor.setAttribute("aria-expanded", "false");
    if (hadFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
    options.onClose?.();
  };

  const onPointerDown = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && !within(element, target) && !anchor.contains(target)) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    // The newest popover closes first.
    if ([...doc.querySelectorAll(POPOVER)].at(-1) !== element) return;
    event.stopPropagation();
    close();
  };

  for (const other of doc.querySelectorAll<HTMLElement>(POPOVER))
    if (!within(other, anchor)) other.dispatchEvent(new Event(CLOSE_EVENT));
  element.addEventListener(CLOSE_EVENT, close);
  doc.body.append(element);
  if (hasPopoverApi(element)) {
    element.setAttribute("popover", "manual");
    element.showPopover();
  }
  anchor.setAttribute("aria-expanded", "true");
  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("keydown", onKeyDown, true);
  reposition();
  return { element, reposition, close };
}
