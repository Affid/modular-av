import type {
  AVState,
  IndicatorContribution,
  ParticipantId,
  ParticipantState,
  VideoSource,
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
import { orderTiles, screenView, tileView } from "../view/tile-view.ts";
import { copiesOn, receiverLabel, viewerNames } from "../view/voice-view.ts";
import { wheelSideways } from "./wheel.ts";
import {
  type Badge,
  createTile,
  type Tile,
  type TileHandlers,
  tileKey,
} from "./tile.ts";
import { type ListSpace, listSpace } from "./list-space.ts";
import { roomUnder } from "./room-under.ts";

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

/** A 16:9 tile's height, as a fraction of its width. */
const TILE_HEIGHT = 9 / 16;

/** The grid as it was last fitted, and the space it was fitted to. */
interface Laid {
  readonly fit: Fitted;
  readonly space: ListSpace;
  readonly focus: boolean;
}

export interface TileList {
  readonly element: HTMLElement;
  setLayout(layout: TileLayout): void;
  /** Horizontal docks scroll sideways. */
  setHorizontal(horizontal: boolean): void;
  /** Scattered tiles are placed one by one, each with its handles. */
  setScattered(scattered: boolean): void;
  /** How far a theme's frames reach past tiles (fractions of their width). */
  setFrameReach(reach: Insets): void;
  /** The tile shown large in the focus layout, by its key. */
  focus(key: string): void;
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

interface Shown {
  readonly key: string;
  readonly participant: ParticipantState;
  readonly source: VideoSource;
}

/**
 * Those in the call, and the local player whatever their state; a
 * player's shared screen right after their camera.
 */
const shown = (s: AVState): readonly Shown[] =>
  orderTiles(
    Object.values(s.participants).filter((p) => p.connected || p.isLocal),
  ).flatMap((p) =>
    (p.hasScreen ? (["camera", "screen"] as const) : (["camera"] as const)).map(
      (source) => ({ key: tileKey(p.id, source), participant: p, source }),
    ),
  );

/** The ear on a player whose browser has modules receiving voices. */
function voiceBadge(
  ctx: DockContext,
  state: AVState,
  id: ParticipantId,
): readonly Badge[] {
  const copies = copiesOn(state, id);
  if (copies.length === 0) return [];
  return [
    {
      id: "voice-copies",
      own: true,
      icon: "fa-solid fa-ear-listen",
      label: receiverLabel(
        ctx.t,
        copies,
        viewerNames(ctx.t, state, ctx.selfId),
      ),
    },
  ];
}

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
  /** By key: a player's id for their camera, with ":screen" for a share. */
  let tiles = new Map<string, Tile>();
  /** Which tile each key is a tile of. */
  let owners = new Map<string, ParticipantId>();
  let focused: string | null = null;
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
  /** Badges are about the player: on their camera's tile, not on a share's. */
  const badgesFor = (key: string): readonly Badge[] =>
    (owners.get(key) ?? key) === key ? badgesOf(key) : [];
  const badgesOf = (id: ParticipantId): readonly Badge[] => [
    ...voiceBadge(ctx, ctx.api.state.get(), id),
    ...indicators
      .filter((c) => active.get(c.id)?.has(id))
      .map((c) => ({ id: c.id, label: ctx.text(c.label), icon: c.icon })),
  ];
  const redrawBadges = (): void => {
    for (const [key, tile] of tiles) tile.setBadges(badgesFor(key));
  };
  const offIndicators = indicators.map((c) => {
    const apply = (ids: ReadonlySet<ParticipantId>): void => {
      active = new Map(active).set(c.id, ids);
      redrawBadges();
    };
    try {
      active = new Map(active).set(c.id, c.active.get());
      return c.active.subscribe(apply);
    } catch (error: unknown) {
      ctx.onError(error);
      return () => undefined;
    }
  });
  // Modules receiving voices on a player's browser: a badge of the dock's.
  const offVoices = ctx.api.state.subscribe((s) => s.voiceCopies, redrawBadges);

  /** The tile width last fitted, to damp the dock's own resizes. */
  let last: Fitted | null = null;
  /** What the room under the tiles was last worked out from. */
  let laid: Laid | null = null;
  let roomTold = "";

  /**
   * Tells a theme the room under the tiles: the height left under the
   * grid (`--mav-dock-spare`, in pixels) and under each tile that ends its
   * column (`--mav-dock-tile-room`, in tile widths). None where tiles are
   * scattered or scroll sideways. Only what the fit already knows: no
   * layout is read, and nothing is written when nothing changed.
   */
  const tellRoom = (): void => {
    const order = [...tiles.values()];
    const large = order.findIndex((t) =>
      t.element.hasAttribute("data-focused"),
    );
    const none = scattered || horizontal || !laid || laid.fit.width <= 1;
    const key = none
      ? `none:${String(order.length)}`
      : JSON.stringify([laid, reach, order.length, large]);
    if (key === roomTold) return;
    roomTold = key;
    const row = (width: number): number =>
      width * (TILE_HEIGHT + reach.top + reach.bottom);
    const room =
      none || !laid
        ? { spare: 0, under: order.map(() => 0) }
        : roomUnder({
            count: order.length,
            columns: laid.fit.columns,
            rowHeight: row(laid.fit.width),
            height: laid.space.height,
            gap: laid.space.gap,
            ...(laid.focus && large >= 0
              ? { large: { index: large, rowHeight: row(laid.fit.focusWidth) } }
              : {}),
          });
    element.style.setProperty(
      "--mav-dock-spare",
      String(Math.floor(room.spare)),
    );
    order.forEach((tile, i) => {
      const width =
        laid?.focus && i === large
          ? laid.fit.focusWidth
          : (laid?.fit.width ?? 1);
      tile.element.style.setProperty(
        "--mav-dock-tile-room",
        String(Number(((room.under[i] ?? 0) / Math.max(1, width)).toFixed(3))),
      );
    });
  };

  /**
   * Fits the grid. A resize the list's own content caused (frames reach
   * past tiles, so the list's height can follow its tiles) refits only
   * for more than a pixel, or tiles would flip between two widths.
   */
  const fit = (fromResize = false): void => {
    // Scattered tiles have sizes of their own.
    if (scattered) {
      tellRoom();
      return;
    }
    const space = listSpace(element);
    const focus = element.dataset.tileLayout === "focus";
    const result = fitted(
      {
        count: tiles.size,
        width: space.width,
        height: space.height,
        gap: space.gap,
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
    if (nudge) {
      // The tiles keep their size; the room under them may still have changed.
      laid = { fit: last ?? result, space, focus };
      tellRoom();
      return;
    }
    last = result;
    laid = { fit: result, space, focus };
    const style = element.style;
    style.setProperty("--mav-dock-columns", String(result.columns));
    style.setProperty("--mav-dock-tile-width", px(result.width));
    style.setProperty("--mav-dock-focus-width", px(result.focusWidth));
    style.setProperty("--mav-dock-focus-span", String(result.span));
    tellRoom();
  };

  const markFocus = (): void => {
    // The local player's tiles come first (their camera, then their own
    // share): by default, the first tile of another player.
    const [own] = tiles.keys();
    const firstOther = [...tiles.keys()].find((key) => owners.get(key) !== own);
    const id = focused && tiles.has(focused) ? focused : (firstOther ?? own);
    for (const [tileId, tile] of tiles)
      tile.element.toggleAttribute("data-focused", tileId === id);
    tellRoom();
  };

  /** The strip back to its start, where the focused tile now is. */
  const focusOn = (key: string): void => {
    focused = key;
    markFocus();
    if (horizontal) element.scrollLeft = 0;
  };

  const newTile = (item: Shown): Tile => {
    const tile = createTile(
      ctx,
      doc,
      item.participant.id,
      { menu: handlers.menu, focus: focusOn },
      item.source,
    );
    tile.setScattered(scattered);
    return tile;
  };

  const sync = (state: AVState): void => {
    const items = shown(state);
    const next = new Map<string, Tile>();
    for (const item of items) {
      const tile = tiles.get(item.key) ?? newTile(item);
      const view = tileView(item.participant, state.local);
      tile.update(item.source === "screen" ? screenView(view) : view);
      next.set(item.key, tile);
    }
    owners = new Map(items.map((i) => [i.key, i.participant.id]));
    const counted = next.size !== tiles.size;
    for (const [key, tile] of tiles) if (!next.has(key)) tile.dispose();
    for (const [key, tile] of next) tile.setBadges(badgesFor(key));
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
      offVoices();
      for (const offIndicator of offIndicators) offIndicator();
      resize?.disconnect();
      offWheel();
      keys.dispose();
      for (const tile of tiles.values()) tile.dispose();
      tiles = new Map();
    },
  };
}
