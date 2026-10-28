import type {
  AVState,
  IndicatorContribution,
  ParticipantId,
} from "@modular-av/api";
import {
  el,
  fitGrid,
  fitSpeaker,
  type GridSpace,
  type Insets,
  NO_INSETS,
  placeInOrder,
  roving,
} from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import type { TileLayout } from "../settings.ts";
import { orderTiles, tileView } from "../view/tile-view.ts";
import { wheelSideways } from "./wheel.ts";
import {
  type Badge,
  createTile,
  type Tile,
  type TileHandlers,
} from "./tile.ts";

/** What the list's custom properties say: the grid, or one player large. */
interface Fitted {
  readonly columns: number;
  readonly width: number;
  /** The large tile's width, and how many thumbnails it spans. */
  readonly focusWidth: number;
  readonly span: number;
}

const px = (value: number): string =>
  `${String(Math.max(1, Math.floor(value)))}px`;

/** One player large over thumbnails, or everyone in the largest grid. */
function fitted(space: GridSpace, focus: boolean): Fitted {
  if (focus) {
    const speaker = fitSpeaker(space);
    return {
      columns: speaker.span,
      width: Math.max(1, Math.floor(speaker.thumbWidth)),
      focusWidth: speaker.focusWidth,
      span: speaker.span,
    };
  }
  const grid = fitGrid(space);
  const width = Math.max(1, Math.floor(grid.tileWidth));
  return { columns: grid.columns, width, focusWidth: width, span: 1 };
}

/** Below this, tiles stop shrinking and the list scrolls. */
const MIN_TILE_WIDTH = 120;

export interface TileList {
  readonly element: HTMLElement;
  setLayout(layout: TileLayout): void;
  /** Horizontal docks scroll sideways. */
  setHorizontal(horizontal: boolean): void;
  /** Scattered tiles are placed one by one, each with its handles. */
  setScattered(scattered: boolean): void;
  /** How far a theme's frames reach past tiles (fractions of their width). */
  setFrameReach(reach: Insets): void;
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

type Slice = readonly [AVState["participants"], AVState["local"]];

const slice = (s: AVState): Slice => [s.participants, s.local];

const sameSlice = (a: Slice, b: Slice): boolean =>
  a[0] === b[0] && a[1] === b[1];

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
  let scattered = false;
  let reach: Insets = NO_INSETS;
  let listeners: readonly (() => void)[] = [];
  const keys = roving(element, {
    items:
      ".mav-dock-tile-menu, .mav-dock-tile-move:not([hidden]), .mav-dock-tile-resize:not([hidden])",
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

  /** The tile width last fitted, to damp the dock's own resizes. */
  let last: Fitted | null = null;

  /**
   * Fits the grid. A resize the list's own content caused (frames reach
   * past tiles, so the list's height can follow its tiles) refits only
   * for more than a pixel, or tiles would flip between two widths.
   */
  const fit = (fromResize = false): void => {
    // Scattered tiles have sizes of their own.
    if (scattered) return;
    const view = element.ownerDocument.defaultView;
    const gap = view
      ? parseFloat(view.getComputedStyle(element).columnGap) || 0
      : 0;
    const focus = element.dataset.tileLayout === "focus";
    const result = fitted(
      {
        count: tiles.size,
        width: element.clientWidth,
        height: element.clientHeight,
        gap,
        // Thumbnails have a smaller floor of their own.
        ...(focus ? {} : { minTileWidth: MIN_TILE_WIDTH }),
        scroll: horizontal ? "sideways" : "down",
        reach,
      },
      focus,
    );
    const nudge =
      fromResize &&
      last?.columns === result.columns &&
      Math.abs(last.width - result.width) <= 1;
    if (nudge) return;
    last = result;
    const style = element.style;
    style.setProperty("--mav-dock-columns", String(result.columns));
    style.setProperty("--mav-dock-tile-width", px(result.width));
    style.setProperty("--mav-dock-focus-width", px(result.focusWidth));
    style.setProperty("--mav-dock-focus-span", String(result.span));
  };

  const markFocus = (): void => {
    // The local player's tile comes first: by default, the first other.
    const [own, firstOther] = tiles.keys();
    const id = focused && tiles.has(focused) ? focused : (firstOther ?? own);
    for (const [tileId, tile] of tiles)
      tile.element.toggleAttribute("data-focused", tileId === id);
  };

  /** The strip back to its start, where the focused tile now is. */
  const focusOn = (participant: ParticipantId): void => {
    focused = participant;
    markFocus();
    if (horizontal) element.scrollLeft = 0;
  };

  const newTile = (id: ParticipantId): Tile => {
    const tile = createTile(ctx, doc, id, {
      menu: handlers.menu,
      focus: focusOn,
    });
    tile.setScattered(scattered);
    return tile;
  };

  const sync = (state: AVState): void => {
    const people = shown(state);
    const next = new Map<ParticipantId, Tile>();
    for (const p of people) {
      const tile = tiles.get(p.id) ?? newTile(p.id);
      tile.update(tileView(p, state.local));
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
    resize = view
      ? new view.ResizeObserver(() => {
          fit(true);
        })
      : null;
    resize?.observe(element);
  };
  observe();
  const offWheel = wheelSideways(element, () => horizontal && !scattered);
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
    setFrameReach(next) {
      reach = next;
      fit();
    },
    setScattered(next) {
      scattered = next;
      for (const tile of tiles.values()) tile.setScattered(next);
      keys.refresh();
      fit();
    },
    focus: focusOn,
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
      offWheel();
      keys.dispose();
      for (const tile of tiles.values()) tile.dispose();
      tiles = new Map();
    },
  };
}
