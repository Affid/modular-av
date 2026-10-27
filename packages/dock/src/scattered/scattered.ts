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
import type { DockContext, SceneRef } from "../context.ts";
import { read, save, SETTINGS } from "../settings.ts";
import {
  type Arrangement,
  arrangementFor,
  freeSpot,
  type LayoutSource,
  PANEL_SPOT,
  parseLayouts,
  parseSceneLayout,
  type SavedLayouts,
  type SceneLayout,
  sourceOf,
  type Spot,
  TILE_WIDTH,
  withoutScene,
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

/** A scene's layout, as the placement menu offers it. */
export interface SceneControls {
  /** A scene is shown: a GM may save its layout. */
  readonly shown: boolean;
  /** A GM saved a layout for it. */
  readonly hasLayout: boolean;
  /** Whose arrangement shows: the player's, the scene's, or theirs for it. */
  readonly source: LayoutSource;
  /** A GM saves the tiles as they are as the scene's layout. */
  save(): Promise<void>;
  /** A GM removes the scene's layout. */
  clear(): Promise<void>;
  /** The player's own arrangement for the scene goes: the scene's shows. */
  back(): void;
}

export interface Scattered {
  /** Tiles came or went: places the new ones. */
  refresh(): void;
  /** Places everything again (a theme's frames changed). */
  relayout(): void;
  readonly scene: SceneControls;
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

/** A tile's saved spot: own entries only, whatever the id. */
const spotFor = (arrangement: Arrangement, id: string): Spot | undefined =>
  Object.hasOwn(arrangement.tiles, id) ? arrangement.tiles[id] : undefined;

/**
 * Every tile at its saved spot, or the next free one, and the panel at
 * its own; all of them out of Foundry's controls, frames included.
 */
function placeAll(
  parts: ScatteredParts,
  arrangement: Arrangement,
  reach: Insets,
): ReadonlyMap<string, Spot> {
  const obstacles = measureControls(parts.root.ownerDocument);
  const shown = tilesIn(parts.tiles);
  const used = new Set(
    shown.flatMap((t) => {
      const spot = spotFor(arrangement, idOf(t));
      return spot ? [spot.anchor] : [];
    }),
  );
  let free = 0;
  const spots = new Map<string, Spot>();
  for (const tile of shown) {
    const spot = spotFor(arrangement, idOf(tile)) ?? freeSpot(free++, used);
    placeAt(tile, spot, obstacles, reach);
    spots.set(idOf(tile), spot);
  }
  placeAt(parts.panel, arrangement.panel ?? PANEL_SPOT, obstacles, null);
  return spots;
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
 * Places everything again, once per frame at most, while the window, the
 * panel or Foundry's controls change: their size, what they hold (a
 * re-render, a chat message), their classes (the sidebar collapsing),
 * and where they are once a transition ends (the sidebar sliding away).
 */
function watchControls(
  doc: Document,
  panel: HTMLElement,
  place: () => void,
): () => void {
  const view = doc.defaultView;
  if (!view) return () => undefined;
  let frame: number | null = null;
  const later = (): void => {
    frame ??= view.requestAnimationFrame(() => {
      frame = null;
      place();
    });
  };
  const resized = new view.ResizeObserver(later);
  const changed = new view.MutationObserver(later);
  resized.observe(panel);
  for (const element of controlElements(doc)) {
    resized.observe(element);
    changed.observe(element, {
      childList: true,
      subtree: true,
      attributeFilter: ["class", "style", "hidden"],
    });
  }
  view.addEventListener("resize", later);
  doc.addEventListener("transitionend", later, true);
  return () => {
    resized.disconnect();
    changed.disconnect();
    view.removeEventListener("resize", later);
    doc.removeEventListener("transitionend", later, true);
    if (frame !== null) view.cancelAnimationFrame(frame);
  };
}

const spotOf = (rect: Rect, element: HTMLElement): Spot => ({
  ...anchorOf(rect, viewportOf(element)),
  width: widthOf(rect.width),
});

/** The panel moves by its header (pointer) and its move button (keys). */
function panelDrags(
  parts: ScatteredParts,
  onEnd: (rect: Rect) => void,
): () => void {
  const undo = [
    dragToMove(parts.panelHandle, parts.panel, { onEnd }),
    dragToMove(parts.panelMove, parts.panel, { onEnd }),
  ];
  return () => {
    for (const step of undo) step();
  };
}

/** Drags on each tile shown, added and removed as tiles come and go. */
function trackTiles(
  parts: ScatteredParts,
  onEnd: (tile: HTMLElement, rect: Rect) => void,
  place: () => void,
): { refresh(): void; dispose(): void } {
  let shownIds: string | null = null;
  let attached = new Map<HTMLElement, () => void>();
  return {
    refresh() {
      const shown = tilesIn(parts.tiles);
      const ids = shown.map(idOf).join(" ");
      if (ids === shownIds) return;
      shownIds = ids;
      const next = new Map(
        shown.map((tile) => {
          const detach =
            attached.get(tile) ??
            draggable(tile, (rect) => {
              onEnd(tile, rect);
            });
          return [tile, detach] as const;
        }),
      );
      for (const [tile, detach] of attached) if (!next.has(tile)) detach();
      attached = next;
      place();
    },
    dispose() {
      for (const detach of attached.values()) detach();
      attached = new Map();
    },
  };
}

interface Shown {
  saved: SavedLayouts;
  scene: SceneRef | null;
  /** Each tile's spot as last placed, for a GM saving the scene's layout. */
  spots: ReadonlyMap<string, Spot>;
}

/** The last scene layout read, parsed once for as long as its text holds. */
let lastLayout: {
  readonly text: unknown;
  readonly parsed: Arrangement | null;
} = { text: undefined, parsed: null };

function layoutOf(scene: SceneRef | null): SceneLayout | null {
  if (!scene) return null;
  const text = scene.layout();
  if (text !== lastLayout.text)
    lastLayout = { text, parsed: parseSceneLayout(text) };
  return { id: scene.id, layout: lastLayout.parsed };
}

function sceneControls(
  shown: Shown,
  store: (next: SavedLayouts) => void,
  place: () => void,
): SceneControls {
  return {
    get shown() {
      return shown.scene !== null;
    },
    get hasLayout() {
      return layoutOf(shown.scene)?.layout != null;
    },
    get source() {
      return sourceOf(shown.saved, layoutOf(shown.scene));
    },
    async save() {
      const scene = shown.scene;
      if (!scene) return;
      await scene.saveLayout({ tiles: Object.fromEntries(shown.spots) });
      store(withoutScene(shown.saved, scene.id));
    },
    async clear() {
      await shown.scene?.clearLayout();
      place();
    },
    back() {
      if (shown.scene) store(withoutScene(shown.saved, shown.scene.id));
    },
  };
}

/**
 * The scattered layout: every tile and the voice panel on their own,
 * anchored to a corner or edge of the window, moved and resized by the
 * pointer or the keyboard, saved per player, and kept clear of Foundry's
 * controls as they change. On a scene with a GM's layout, that shows
 * until the player moves a tile there.
 */
export function createScattered(
  ctx: DockContext,
  parts: ScatteredParts,
  options: ScatteredOptions,
): Scattered {
  const shown: Shown = {
    saved: parseLayouts(read(ctx, SETTINGS.scattered)),
    scene: ctx.scenes.current(),
    spots: new Map(),
  };
  const place = (): void => {
    const arrangement = arrangementFor(shown.saved, layoutOf(shown.scene));
    shown.spots = placeAll(parts, arrangement, options.reach());
  };
  const store = (next: SavedLayouts): void => {
    shown.saved = next;
    save(ctx, SETTINGS.scattered, next);
    place();
  };
  const tiles = trackTiles(
    parts,
    (tile, rect) => {
      const spot = spotOf(rect, tile);
      store(withTile(shown.saved, layoutOf(shown.scene), idOf(tile), spot));
    },
    place,
  );
  const undo = [
    panelDrags(parts, (rect) => {
      store(withPanel(shown.saved, { ...spotOf(rect, parts.panel), width: 0 }));
    }),
    watchControls(parts.root.ownerDocument, parts.panel, place),
    ctx.scenes.onChange(() => {
      shown.scene = ctx.scenes.current();
      place();
    }),
  ];
  tiles.refresh();
  return {
    refresh: () => {
      tiles.refresh();
    },
    relayout: place,
    scene: sceneControls(shown, store, place),
    dispose() {
      for (const step of undo) step();
      tiles.dispose();
      for (const element of [...tilesIn(parts.tiles), parts.panel])
        clearPlace(element);
    },
  };
}
