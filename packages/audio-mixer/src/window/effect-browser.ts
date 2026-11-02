import type { AudioPlace } from "@modular-av/api";
import { el, uniqueId } from "@modular-av/kit";
import { MODULE_ID } from "../constants.ts";
import { NOISE_KEY, type Offer, type Offers } from "../model/rack.ts";
import type { MixerContext } from "./context.ts";
import type { PopContent } from "./popover.ts";

const RECENT_KEY = `${MODULE_ID}.recent`;
const RECENT_MAX = 4;

/** What this device added lately; empty if the browser keeps nothing. */
export function readRecent(storage: Storage | null): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((k): k is string => typeof k === "string")
          .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberRecent(storage: Storage | null, key: string): void {
  try {
    const next = [key, ...readRecent(storage).filter((k) => k !== key)];
    storage?.setItem(RECENT_KEY, JSON.stringify(next.slice(0, RECENT_MAX)));
  } catch {
    // Private windows may refuse: recent is a convenience.
  }
}

const GROUPS = ["recent", "forPlace", "others", "inChain"] as const;

const labelOf = (ctx: MixerContext, offer: Offer): string =>
  offer.key === NOISE_KEY
    ? ctx.t("groups.noise-suppression")
    : ctx.text(offer.effect.label);

function badgeOf(ctx: MixerContext, offer: Offer): string {
  if (offer.unsupported) return ctx.t("states.unsupported");
  if (offer.effect.tail !== undefined) return ctx.t("browser.ringsOn");
  return offer.effect.cost === "light"
    ? ""
    : ctx.t(`cost.${offer.effect.cost}`);
}

function option(ctx: MixerContext, doc: Document, offer: Offer): HTMLElement {
  const badge = badgeOf(ctx, offer);
  const found = el("div", {
    doc,
    className: "mav-mixer-offer",
    attrs: {
      id: uniqueId(doc, "mav-mixer-offer"),
      role: "option",
      "aria-selected": "false",
      "data-offer": offer.key,
      ...(offer.unsupported ? { "aria-disabled": "true" } : {}),
    },
    children: [
      el("span", { doc, text: labelOf(ctx, offer) }),
      badge
        ? el("span", { doc, className: "mav-mixer-chip", text: badge })
        : null,
    ],
  });
  return found;
}

/**
 * Every effect that can go in: search first, then recent, made for this
 * place, the rest, and what is already in the chain (picking it moves it).
 */
export function effectBrowser(
  ctx: MixerContext,
  doc: Document,
  place: AudioPlace,
  offers: Offers,
  pick: (offer: Offer) => void,
): PopContent {
  const listId = uniqueId(doc, "mav-mixer-offers");
  const search = el("input", {
    doc,
    attrs: {
      type: "search",
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": listId,
      "aria-autocomplete": "list",
      "aria-label": ctx.t("search"),
      placeholder: ctx.t("search"),
      "data-field": "search",
    },
  });
  const list = el("div", {
    doc,
    className: "mav-mixer-offers",
    attrs: {
      id: listId,
      role: "listbox",
      "aria-label": ctx.t(`addTo.${place}`),
    },
  });
  const all = new Map<HTMLElement, Offer>();
  let active: HTMLElement | null = null;
  const enabled = (): HTMLElement[] =>
    [...list.querySelectorAll<HTMLElement>("[data-offer]")].filter(
      (o) =>
        !o.hidden &&
        !o.closest<HTMLElement>("[role=group]")?.hidden &&
        o.getAttribute("aria-disabled") !== "true",
    );
  const activate = (next: HTMLElement | null): void => {
    active?.setAttribute("aria-selected", "false");
    active = next;
    active?.setAttribute("aria-selected", "true");
    if (active) search.setAttribute("aria-activedescendant", active.id);
    else search.removeAttribute("aria-activedescendant");
    active?.scrollIntoView({ block: "nearest" });
  };
  const choose = (target: HTMLElement | null): void => {
    const offer = target ? all.get(target) : undefined;
    if (offer && !offer.unsupported) pick(offer);
  };
  for (const group of GROUPS) {
    const items = offers[group];
    if (!items.length) continue;
    const headingId = uniqueId(doc, "mav-mixer-group");
    const options = items.map((offer) => {
      const found = option(ctx, doc, offer);
      all.set(found, offer);
      return found;
    });
    list.append(
      el("div", {
        doc,
        attrs: { role: "group", "aria-labelledby": headingId },
        children: [
          el("div", {
            doc,
            className: "mav-mixer-offer-group",
            text: ctx.t(`browser.${group}`),
            attrs: { id: headingId },
          }),
          ...options,
        ],
      }),
    );
  }
  const empty = el("p", {
    doc,
    className: "mav-mixer-hint",
    text: ctx.t("browser.none"),
  });
  const filter = (): void => {
    const words = search.value.trim().toLocaleLowerCase();
    for (const [found, offer] of all)
      found.hidden = !labelOf(ctx, offer).toLocaleLowerCase().includes(words);
    for (const group of list.querySelectorAll<HTMLElement>("[role=group]"))
      group.hidden = ![
        ...group.querySelectorAll<HTMLElement>("[data-offer]"),
      ].some((o) => !o.hidden);
    empty.hidden =
      enabled().length > 0 || [...all.keys()].some((o) => !o.hidden);
    activate(null);
  };
  search.addEventListener("input", filter);
  search.addEventListener("keydown", (event) => {
    const options = enabled();
    const at = active ? options.indexOf(active) : -1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const by = event.key === "ArrowDown" ? 1 : -1;
      const next = options[Math.min(Math.max(at + by, 0), options.length - 1)];
      activate(next ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active ?? options[0] ?? null);
    }
  });
  list.addEventListener("click", (event) => {
    choose((event.target as HTMLElement).closest<HTMLElement>("[data-offer]"));
  });
  filter();
  return {
    element: el("div", {
      doc,
      className: "mav-mixer-pop-body",
      children: [search, list, empty],
    }),
    focus: search,
    dispose: () => undefined,
  };
}
