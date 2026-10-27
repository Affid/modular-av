import {
  anchorOf,
  avoid,
  dragToMove,
  dragToResize,
  type Insets,
  NO_INSETS,
  placeAnchored,
  type Rect,
  viewportOf,
} from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { read, save, SETTINGS } from "../settings.ts";
import {
  type Arrangement,
  arrangementFor,
  freeSpot,
  PANEL_SPOT,
  parseLayouts,
  type SavedLayouts,
  type Spot,
  TILE_WIDTH,
  withPanel,
  withTile,
} from "./arrangement.ts";
import { controlElements, measureControls } from "./obstacles.ts";

export interface ScatteredParts {
  /** The dock's root, a layer over the whole window in this layout. */
  readonly root: HTMLElement;
  readonly tiles: HTMLElement;
  /** The voice panel, with the dock's header in it. */
  readonly panel: HTMLElement;
  /** Drags the panel with the pointer. */
  readonly panelHandle: HTMLElement;
  /** Moves the panel with the arrow keys. */
  readonly panelMove: HTMLElement;
}

export interface ScatteredOptions {
  /** How far tile frames reach past a tile, as fractions of its width. */
  readonly reach: () => Insets;
}

export interface Scattered {
  /** Tiles came or went: places the new ones. */
  refresh(): void;
  /** Places everything again (a theme's frames changed). */
  relayout(): void;
  dispose(): void;
}

const TILE = ".mav-dock-tile";

const px = (value: number): string => `${String(Math.round(value))}px`;

const times = (reach: Insets, width: number): Insets => ({
  top: reach.top * width,
  right: reach.right * width,
  bottom: reach.bottom * width,
  left: reach.left * width,
});

const widthOf = (width: number): number =>
  Math.min(TILE_WIDTH.max, Math.max(TILE_WIDTH.min, Math.round(width)));

/** Places one element at its spot, then out of Foundry's controls. */
function placeAt(
  element: HTMLElement,
  spot: Spot,
  obstacles: readonly Rect[],
  reach: Insets | null,
): void {
  if (reach) element.style.width = px(spot.width);
  const viewport = viewportOf(element);
  const size = { width: element.offsetWidth, height: element.offsetHeight };
  const rect = avoid(placeAnchored(spot, size, viewport), obstacles, viewport, {
    reach: reach ? times(reach, size.width) : NO_INSETS,
  });
  element.style.left = px(rect.left);
  element.style.top = px(rect.top);
  element.dataset.anchor = spot.anchor;
}

function clearPlace(element: HTMLElement): void {
  for (const property of ["left", "top", "width"])
    element.style.removeProperty(property);
  delete element.dataset.anchor;
}

const tilesIn = (list: HTMLElement): HTMLElement[] =>
  Array.from(list.querySelectorAll<HTMLElement>(TILE));

const idOf = (tile: HTMLElement): string => tile.dataset.participantId ?? "";

/**
 * Every tile at its saved spot, or the next free one, and the panel at
 * its own; all of them out of Foundry's controls, frames included.
 */
function placeAll(
  parts: ScatteredParts,
  arrangement: Arrangement,
  reach: Insets,
): void {
  const obstacles = measureControls(parts.root.ownerDocument);
  const shown = tilesIn(parts.tiles);
  const used = new Set(
    shown.flatMap((t) => {
      const spot = arrangement.tiles[idOf(t)];
      return spot ? [spot.anchor] : [];
    }),
  );
  let free = 0;
  for (const tile of shown) {
    const spot = arrangement.tiles[idOf(tile)] ?? freeSpot(free++, used);
    placeAt(tile, spot, obstacles, reach);
  }
  placeAt(parts.panel, arrangement.panel ?? PANEL_SPOT, obstacles, null);
}

/** Drags a tile (anywhere but its buttons), its move handle and its resize handle. */
function draggable(tile: HTMLElement, onEnd: (rect: Rect) => void): () => void {
  const move = tile.querySelector<HTMLElement>(".mav-dock-tile-move");
  const resize = tile.querySelector<HTMLElement>(".mav-dock-tile-resize");
  const undo = [
    dragToMove(tile, tile, { onEnd }),
    ...(move ? [dragToMove(move, tile, { onEnd })] : []),
    // Only the width: the height follows the tile's 16:9.
    ...(resize
      ? [
          dragToResize(resize, tile, {
            edges: () => ["right"],
            min: { width: TILE_WIDTH.min, height: 0 },
            onEnd,
          }),
        ]
      : []),
  ];
  return () => {
    for (const step of undo) step();
  };
}

/**
 * Places everything again, once per frame at most, while the window or Foundry's
 * controls change size (the sidebar collapsing, the players list growing).
 */
function watchControls(doc: Document, place: () => void): () => void {
  const view = doc.defaultView;
  if (!view) return () => undefined;
  let frame: number | null = null;
  const later = (): void => {
    frame ??= view.requestAnimationFrame(() => {
      frame = null;
      place();
    });
  };
  const observer = new view.ResizeObserver(later);
  for (const element of controlElements(doc)) observer.observe(element);
  view.addEventListener("resize", later);
  return () => {
    observer.disconnect();
    view.removeEventListener("resize", later);
    if (frame !== null) view.cancelAnimationFrame(frame);
  };
}

/**
 * The scattered layout: every tile and the voice panel on their own,
 * anchored to a corner or edge of the window, moved and resized by the
 * pointer or the keyboard, saved per player, and kept clear of Foundry's
 * controls as they change.
 */
export function createScattered(
  ctx: DockContext,
  parts: ScatteredParts,
  options: ScatteredOptions,
): Scattered {
  let saved: SavedLayouts = parseLayouts(read(ctx, SETTINGS.scattered));
  let shownIds: string | null = null;
  let attached = new Map<HTMLElement, () => void>();

  const place = (): void => {
    placeAll(parts, arrangementFor(saved, null), options.reach());
  };
  const store = (next: SavedLayouts): void => {
    saved = next;
    save(ctx, SETTINGS.scattered, next);
    place();
  };
  const spotOf = (rect: Rect, element: HTMLElement): Spot => ({
    ...anchorOf(rect, viewportOf(element)),
    width: widthOf(rect.width),
  });
  const attach = (tile: HTMLElement): (() => void) =>
    draggable(tile, (rect) => {
      store(withTile(saved, null, idOf(tile), spotOf(rect, tile)));
    });
  const onPanelEnd = (rect: Rect): void => {
    store(withPanel(saved, { ...spotOf(rect, parts.panel), width: 0 }));
  };
  const undo = [
    dragToMove(parts.panelHandle, parts.panel, { onEnd: onPanelEnd }),
    dragToMove(parts.panelMove, parts.panel, { onEnd: onPanelEnd }),
    watchControls(parts.root.ownerDocument, place),
  ];

  const refresh = (): void => {
    const shown = tilesIn(parts.tiles);
    const ids = shown.map(idOf).join(" ");
    if (ids === shownIds) return;
    shownIds = ids;
    const next = new Map(
      shown.map((tile) => [tile, attached.get(tile) ?? attach(tile)] as const),
    );
    for (const [tile, detach] of attached) if (!next.has(tile)) detach();
    attached = next;
    place();
  };

  refresh();
  return {
    refresh,
    relayout: place,
    dispose() {
      for (const step of [...undo, ...attached.values()]) step();
      attached = new Map();
      for (const element of [...tilesIn(parts.tiles), parts.panel])
        clearPlace(element);
    },
  };
}
