import type {
  AVState,
  IndicatorContribution,
  ParticipantId,
} from "@modular-av/api";
import { el, fitGrid, placeInOrder, roving } from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import type { TileLayout } from "../settings.ts";
import { orderTiles, tileView } from "../view/tile-view.ts";
import {
  type Badge,
  createTile,
  type Tile,
  type TileHandlers,
} from "./tile.ts";

/** Below this, tiles stop shrinking and the list scrolls. */
const MIN_TILE_WIDTH = 120;

export interface TileList {
  readonly element: HTMLElement;
  setLayout(layout: TileLayout): void;
  /** Horizontal docks scroll sideways. */
  setHorizontal(horizontal: boolean): void;
  /** The tile shown large in the focus layout. */
  focus(participant: ParticipantId): void;
  /** How many tiles there are now. */
  readonly count: number;
  /** The list moved to another window (Picture-in-Picture): watch it there. */
  rehome(): void;
  /** After tiles came, went or changed. */
  onChange(listener: () => void): void;
  dispose(): void;
}

type Slice = readonly [
  AVState["participants"],
  AVState["local"],
  AVState["worldMode"],
];

const slice = (s: AVState): Slice => [s.participants, s.local, s.worldMode];

const sameSlice = (a: Slice, b: Slice): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Those in the call, and the local player whatever their state. */
const shown = (s: AVState) =>
  orderTiles(
    Object.values(s.participants).filter((p) => p.connected || p.isLocal),
  );

/**
 * The tiles, kept between changes (videos never restart), in the dock's
 * order, fitted to the space: the grid makes 16:9 tiles as large as fit.
 */
export function createTileList(
  ctx: DockContext,
  doc: Document,
  handlers: Pick<TileHandlers, "menu">,
): TileList {
  const element = el("ol", {
    doc,
    className: "mav-dock-tiles",
    attrs: { "aria-label": ctx.t("dock.tiles") },
  });
  let tiles = new Map<ParticipantId, Tile>();
  let focused: ParticipantId | null = null;
  let horizontal = false;
  let listeners: readonly (() => void)[] = [];
  const keys = roving(element, {
    items: ".mav-dock-tile-menu",
    orientation: "both",
  });

  // Other modules' indicators: who each is active for, followed while shown.
  const indicators = ctx.api.contributions
    .list()
    .filter((c): c is IndicatorContribution => c.kind === "indicator");
  let active = new Map<string, ReadonlySet<ParticipantId>>();
  const badgesOf = (id: ParticipantId): readonly Badge[] =>
    indicators
      .filter((c) => active.get(c.id)?.has(id))
      .map((c) => ({ id: c.id, label: ctx.text(c.label), icon: c.icon }));
  const offIndicators = indicators.map((c) => {
    const apply = (ids: ReadonlySet<ParticipantId>): void => {
      active = new Map(active).set(c.id, ids);
      for (const [id, tile] of tiles) tile.setBadges(badgesOf(id));
    };
    try {
      active = new Map(active).set(c.id, c.active.get());
      return c.active.subscribe(apply);
    } catch (error: unknown) {
      ctx.onError(error);
      return () => undefined;
    }
  });

  const fit = (): void => {
    const view = element.ownerDocument.defaultView;
    const gap = view
      ? parseFloat(view.getComputedStyle(element).columnGap) || 0
      : 0;
    const result = fitGrid({
      count: element.dataset.tileLayout === "focus" ? 1 : tiles.size,
      width: element.clientWidth,
      height: element.clientHeight,
      gap,
      minTileWidth: MIN_TILE_WIDTH,
      scroll: horizontal ? "sideways" : "down",
    });
    element.style.setProperty("--mav-dock-columns", String(result.columns));
    element.style.setProperty(
      "--mav-dock-tile-width",
      `${String(Math.max(1, Math.floor(result.tileWidth)))}px`,
    );
  };

  const markFocus = (): void => {
    const first = tiles.keys().next().value ?? null;
    const id = focused && tiles.has(focused) ? focused : first;
    for (const [tileId, tile] of tiles)
      tile.element.toggleAttribute("data-focused", tileId === id);
  };

  const sync = (state: AVState): void => {
    const people = shown(state);
    const next = new Map<ParticipantId, Tile>();
    for (const p of people) {
      const tile =
        tiles.get(p.id) ??
        createTile(ctx, doc, p.id, {
          menu: handlers.menu,
          focus: (id) => {
            focused = id;
            markFocus();
          },
        });
      tile.update(tileView(p, state.local, state.worldMode));
      next.set(p.id, tile);
    }
    const counted = next.size !== tiles.size;
    for (const [id, tile] of tiles) if (!next.has(id)) tile.dispose();
    for (const [id, tile] of next) tile.setBadges(badgesOf(id));
    placeInOrder(
      element,
      [...next.values()].map((t) => t.element),
    );
    tiles = next;
    element.dataset.count = String(tiles.size);
    markFocus();
    keys.refresh();
    // Speaking or a volume changes nothing of the layout: no layout reads.
    if (counted) fit();
    for (const listener of listeners) listener();
  };

  const off = ctx.api.state.subscribe(
    slice,
    () => {
      sync(ctx.api.state.get());
    },
    { equals: sameSlice },
  );
  /** A resize observer from the window the list is in now. */
  let resize: ResizeObserver | null = null;
  let observedIn: Window | null = null;
  const observe = (): void => {
    const view = element.ownerDocument.defaultView;
    if (view === observedIn) return;
    resize?.disconnect();
    observedIn = view;
    resize = view ? new view.ResizeObserver(fit) : null;
    resize?.observe(element);
  };
  observe();
  sync(ctx.api.state.get());
  fit();

  return {
    element,
    setLayout(layout) {
      element.dataset.tileLayout = layout;
      fit();
    },
    setHorizontal(next) {
      horizontal = next;
      fit();
    },
    focus(participant) {
      focused = participant;
      markFocus();
    },
    get count() {
      return tiles.size;
    },
    rehome() {
      observe();
      fit();
    },
    onChange(listener) {
      listeners = [...listeners, listener];
    },
    dispose() {
      off();
      for (const offIndicator of offIndicators) offIndicator();
      resize?.disconnect();
      keys.dispose();
      for (const tile of tiles.values()) tile.dispose();
      tiles = new Map();
    },
  };
}
