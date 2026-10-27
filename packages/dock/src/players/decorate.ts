import type { AVState, PlayersSurfaceDefinition } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { type DockContext, MODULE_ID } from "../context.ts";
import { type IndicatorName, syncIndicators } from "../ui/indicators.ts";
import { tileView } from "../view/tile-view.ts";

/** What the player list shows of each player in the call. */
const SHOWN: ReadonlySet<IndicatorName> = new Set([
  "muted",
  "deafened",
  "blocked-audio",
  "blocked-video",
  "connection",
]);

const BADGES = "mav-players-badges";

/** Marks one list item: speaking, in the call, and the player's indicators. */
function mark(ctx: DockContext, item: HTMLElement, state: AVState): void {
  const id = item.dataset.userId ?? "";
  const p = state.participants[id];
  const view = p ? tileView(p, state.local) : null;
  item.toggleAttribute("data-speaking", view?.flags.speaking ?? false);
  item.toggleAttribute("data-in-call", p?.connected ?? false);
  let badges = item.querySelector<HTMLElement>(`:scope > .${BADGES}`);
  if (!badges) {
    badges = el("span", { doc: item.ownerDocument, className: BADGES });
    item.append(badges);
  }
  const names = (view?.indicators ?? []).filter((n) => SHOWN.has(n));
  syncIndicators(ctx, badges, p?.connected ? names : []);
}

/**
 * Decorations of Foundry's player list. Foundry re-renders the list now
 * and then; between renders the decorations follow the state in place.
 */
export function playersSurface(ctx: DockContext): PlayersSurfaceDefinition {
  let list: HTMLElement | null = null;
  const render = (): void => {
    if (!list?.isConnected) return;
    const state = ctx.api.state.get();
    for (const item of list.querySelectorAll<HTMLElement>("li[data-user-id]"))
      mark(ctx, item, state);
  };
  let subscribed = false;
  return {
    kind: "players",
    id: `${MODULE_ID}.players`,
    label: `${MODULE_ID}.surfaces.players`,
    decorate(element) {
      list = element;
      if (!subscribed) {
        subscribed = true;
        ctx.api.state.subscribe((s) => s.participants, render);
      }
      render();
    },
  };
}
