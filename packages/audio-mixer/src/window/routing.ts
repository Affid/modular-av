import type { AudioPlace } from "@modular-av/api";
import { el, icon, uniqueId } from "@modular-av/kit";
import { cardStateOf, PLACES, type Rack } from "../model/rack.ts";
import { type Card, nameOf, renderCard } from "./card.ts";
import type { ChainData } from "./chain-data.ts";
import type { MixerContext } from "./context.ts";
import { byField } from "./fields.ts";

/** What the panel asks for; none of it on another player's chain. */
export interface RoutingHandlers {
  select(key: string): void;
  toggle(key: string): void;
  remove(key: string): void;
  move(key: string, by: -1 | 1): void;
  /** To the end of the place before (-1) or after (1). */
  shift(key: string, by: -1 | 1): void;
  drop(key: string, place: AudioPlace, index: number): void;
  settings(key: string, anchor: HTMLElement): void;
  add(place: AudioPlace, anchor: HTMLElement): void;
  toLevel(key: string): void;
}

export interface Routing {
  readonly element: HTMLElement;
  readonly cards: ReadonlyMap<string, Card>;
  /** Puts the keyboard on `key`'s card, or the first one. */
  focus(key: string | null): void;
}

/** Where a dragged card lands: before the first card whose middle is below. */
export const dropIndex = (middles: readonly number[], y: number): number =>
  middles.filter((middle) => middle < y).length;

const cardsIn = (list: HTMLElement): HTMLElement[] => [
  ...list.querySelectorAll<HTMLElement>(":scope > [data-key]"),
];

function column(
  ctx: MixerContext,
  doc: Document,
  rack: Rack,
  items: readonly HTMLElement[],
  add: HTMLElement | null,
): HTMLElement {
  const headingId = uniqueId(doc, "mav-mixer-place");
  return el("section", {
    doc,
    className: "mav-mixer-place",
    attrs: {
      "data-part": rack.place,
      title: ctx.t(`placeHints.${rack.place}`),
    },
    children: [
      el("h3", {
        doc,
        attrs: { id: headingId },
        children: [
          el("span", { doc, text: ctx.t(`places.${rack.place}`) }),
          el("span", {
            doc,
            className: "mav-mixer-count",
            text: rack.slots.length ? String(rack.slots.length) : "",
          }),
        ],
      }),
      el("ul", {
        doc,
        className: "mav-mixer-rack",
        attrs: { "aria-labelledby": headingId, "data-rack": rack.place },
        children: [...items],
      }),
      add,
    ],
  });
}

function addButton(
  ctx: MixerContext,
  doc: Document,
  place: AudioPlace,
  handlers: RoutingHandlers,
): HTMLElement {
  const button = el("button", {
    doc,
    className: "mav-mixer-add",
    attrs: {
      type: "button",
      "data-field": `add.${place}`,
      "aria-haspopup": "dialog",
    },
    children: [
      icon("fa-plus", doc),
      el("span", { doc, text: ctx.t(`addTo.${place}`) }),
    ],
  });
  button.addEventListener("click", () => {
    handlers.add(place, button);
  });
  return button;
}

/** Arrows along a place and across places; Alt moves the card itself. */
function onKey(
  root: HTMLElement,
  handlers: RoutingHandlers,
  event: KeyboardEvent,
): void {
  const card = (event.target as HTMLElement).closest<HTMLElement>("[data-key]");
  const key = card?.dataset.key;
  if (!card || !key || event.target !== card) return;
  const lists = [...root.querySelectorAll<HTMLElement>("[data-rack]")];
  const list = card.parentElement;
  if (!list) return;
  const here = cardsIn(list);
  const at = here.indexOf(card);
  const go = (target: HTMLElement | undefined): void => {
    if (!target) return;
    for (const other of root.querySelectorAll<HTMLElement>("[data-key]"))
      other.tabIndex = other === target ? 0 : -1;
    target.focus();
  };
  const across = (by: -1 | 1): HTMLElement | undefined => {
    const index = lists.indexOf(list);
    const next =
      by > 0 ? lists.slice(index + 1) : lists.slice(0, index).reverse();
    return next.map((l) => cardsIn(l)[0]).find(Boolean);
  };
  const vertical =
    event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
  const sideways =
    event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  const handled = (): void => {
    event.preventDefault();
  };
  if (vertical) {
    handled();
    if (event.altKey) handlers.move(key, vertical);
    else go(here[at + vertical]);
  } else if (sideways) {
    handled();
    if (event.altKey) handlers.shift(key, sideways);
    else go(across(sideways));
  } else if (event.key === " ") {
    handled();
    handlers.toggle(key);
  } else if (event.key === "Enter") {
    handled();
    const button = byField(card, `settings.${key}`);
    if (button) handlers.settings(key, button);
  } else if (event.key === "Delete" || event.key === "Backspace") {
    handled();
    handlers.remove(key);
  } else if (event.key === "l" || event.key === "L") {
    handled();
    handlers.toLevel(key);
  }
}

function onClick(handlers: RoutingHandlers, event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>("[data-key]");
  const key = card?.dataset.key;
  if (!card || !key) return;
  const field =
    target.closest<HTMLElement>("[data-field]")?.dataset.field ?? "";
  if (field === `on.${key}`) handlers.toggle(key);
  else if (field === `settings.${key}`)
    handlers.settings(key, target.closest("button") ?? card);
  else if (field === `level.${key}`) handlers.toLevel(key);
  else {
    handlers.select(key);
    card.focus();
  }
}

/** Drag a card along its place or into another; the keys do the same. */
function wireDrag(
  ctx: MixerContext,
  root: HTMLElement,
  live: HTMLElement,
  data: ChainData,
  handlers: RoutingHandlers,
): void {
  let dragged: string | null = null;
  const clear = (): void => {
    for (const mark of root.querySelectorAll("[data-drop]"))
      mark.removeAttribute("data-drop");
  };
  const target = (event: DragEvent) => {
    const list = (event.target as HTMLElement)
      .closest<HTMLElement>("[data-part]")
      ?.querySelector<HTMLElement>("[data-rack]");
    if (!list || !dragged) return null;
    const others = cardsIn(list).filter((c) => c.dataset.key !== dragged);
    const middles = others.map((c) => {
      const box = c.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const index = dropIndex(middles, event.clientY);
    return { list, others, index, place: list.dataset.rack as AudioPlace };
  };
  root.addEventListener("dragstart", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-key]",
    );
    dragged = card?.dataset.key ?? null;
    if (!card || !dragged) return;
    event.dataTransfer?.setData("text/plain", dragged);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    card.dataset.dragging = "";
  });
  root.addEventListener("dragover", (event) => {
    const at = target(event);
    if (!at) return;
    event.preventDefault();
    clear();
    const before = at.others[at.index];
    if (before) before.dataset.drop = "before";
    else at.list.dataset.drop = "end";
    const slot = data.racks
      .flatMap((r) => r.slots)
      .find((s) => s.key === dragged);
    if (slot)
      live.textContent = ctx.t("drag.over", {
        effect: nameOf(ctx, slot),
        place: ctx.t(`places.${at.place}`),
        position: String(at.index + 1),
        count: String(at.others.length + 1),
      });
  });
  root.addEventListener("drop", (event) => {
    const at = target(event);
    clear();
    if (!at || !dragged) return;
    event.preventDefault();
    handlers.drop(dragged, at.place, at.index);
  });
  root.addEventListener("dragend", () => {
    clear();
    for (const card of root.querySelectorAll<HTMLElement>("[data-dragging]"))
      delete card.dataset.dragging;
    dragged = null;
  });
}

/** The chain as cards, place by place, with the gate between. */
export function renderRouting(
  ctx: MixerContext,
  doc: Document,
  data: ChainData,
  gate: HTMLElement,
  handlers: RoutingHandlers | null,
): Routing {
  const readOnly = handlers === null;
  const cards = new Map<string, Card>();
  const columns = PLACES.map((place) => {
    const rack = data.racks.find((r) => r.place === place) ?? {
      place,
      slots: [],
    };
    const items = rack.slots.map((slot) => {
      const card = renderCard(
        ctx,
        doc,
        data,
        slot,
        cardStateOf(slot, data.local),
        readOnly,
      );
      cards.set(slot.key, card);
      return card.element;
    });
    return column(
      ctx,
      doc,
      rack,
      items,
      handlers ? addButton(ctx, doc, place, handlers) : null,
    );
  });
  const [pre, post, send] = columns;
  const live = el("p", {
    doc,
    className: "mav-mixer-live",
    attrs: { "aria-live": "polite", "data-field": "announce" },
  });
  const element = el("section", {
    doc,
    className: "mav-mixer-routing",
    attrs: { "data-panel": "routing", "aria-label": ctx.t("routing") },
    children: [
      el("p", {
        doc,
        className: "mav-mixer-rail",
        attrs: { "aria-hidden": "true" },
        children: [
          el("span", { doc, text: ctx.t("rail.from") }),
          el("span", { doc, className: "mav-mixer-rail-line" }),
          el("span", { doc, text: ctx.t("rail.to") }),
        ],
      }),
      el("div", {
        doc,
        className: "mav-mixer-places",
        children: [pre, gate, post, send],
      }),
      live,
    ],
  });
  if (handlers) {
    element.addEventListener("keydown", (event) => {
      onKey(element, handlers, event);
    });
    element.addEventListener("click", (event) => {
      onClick(handlers, event);
    });
    element.addEventListener("focusin", (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-key]",
      );
      if (!card || event.target !== card) return;
      for (const other of element.querySelectorAll<HTMLElement>("[data-key]"))
        other.tabIndex = other === card ? 0 : -1;
    });
    wireDrag(ctx, element, live, data, handlers);
  }
  const focusable = (key: string | null): HTMLElement | undefined => {
    const all = [...element.querySelectorAll<HTMLElement>("[data-key]")];
    return all.find((card) => card.dataset.key === key) ?? all[0];
  };
  const initial = focusable(null);
  if (initial) initial.tabIndex = 0;
  return {
    element,
    cards,
    focus(key) {
      const card = focusable(key);
      if (!card) return;
      for (const other of element.querySelectorAll<HTMLElement>("[data-key]"))
        other.tabIndex = other === card ? 0 : -1;
      card.focus();
    },
  };
}
