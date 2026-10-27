import type { ParticipantId } from "@modular-av/api";
import { type Anchor, type Anchored, isAnchor } from "@modular-av/kit";

/** A scattered tile or the voice panel: where it is, and a tile's width. */
export interface Spot extends Anchored {
  readonly width: number;
}

/** Where the tiles are (by participant) and the voice panel. */
export interface Arrangement {
  readonly tiles: Readonly<Record<ParticipantId, Spot>>;
  readonly panel: Spot | null;
}

/**
 * A player's saved arrangements (`user` scope): their own, and their own
 * for the scenes whose GM layout they changed.
 */
export interface SavedLayouts {
  readonly own: Arrangement;
  readonly scenes: Readonly<Record<string, Arrangement>>;
}

/** Whose arrangement shows: the player's, the scene's, or the player's for the scene. */
export type LayoutSource = "own" | "scene" | "own-scene";

export interface SceneLayout {
  readonly id: string;
  /** The arrangement a GM saved for the scene, if any. */
  readonly layout: Arrangement | null;
}

export const TILE_WIDTH = { min: 120, max: 640, default: 240 } as const;

/** Bounds on what a saved value may hold, so a broken one stays small. */
const MAX_TILES = 100;
const MAX_SCENES = 200;
const MAX_OFFSET = 10_000;
const ID = /^[\w-]{1,64}$/;

export const NO_ARRANGEMENT: Arrangement = { tiles: {}, panel: null };
export const NO_LAYOUTS: SavedLayouts = { own: NO_ARRANGEMENT, scenes: {} };

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isOffset = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_OFFSET;

/** A saved spot, or null if it isn't one; widths are kept within bounds. */
export function parseSpot(value: unknown): Spot | null {
  if (!isRecord(value)) return null;
  const { anchor, dx, dy, width } = value;
  if (!isAnchor(anchor) || !isOffset(dx) || !isOffset(dy)) return null;
  if (typeof width !== "number" || !Number.isFinite(width)) return null;
  return {
    anchor,
    dx,
    dy,
    width: Math.min(TILE_WIDTH.max, Math.max(TILE_WIDTH.min, width)),
  };
}

/** Entries of a saved record whose keys are ids, at most `limit`. */
function entries(value: unknown, limit: number): [string, unknown][] {
  return isRecord(value)
    ? Object.entries(value)
        .filter(([key]) => ID.test(key))
        .slice(0, limit)
    : [];
}

/** A saved arrangement; what is broken in it is left out. */
export function parseArrangement(value: unknown): Arrangement {
  if (!isRecord(value)) return NO_ARRANGEMENT;
  const tiles = entries(value.tiles, MAX_TILES).flatMap(([id, spot]) => {
    const parsed = parseSpot(spot);
    return parsed ? [[id, parsed] as const] : [];
  });
  return { tiles: Object.fromEntries(tiles), panel: parseSpot(value.panel) };
}

/** A scene layout longer than this is no layout. */
const MAX_SCENE_TEXT = 100_000;

/**
 * A scene's layout as a GM saved it (JSON text in a scene flag), or null
 * where there is none or it can't be read.
 */
export function parseSceneLayout(value: unknown): Arrangement | null {
  if (typeof value !== "string" || value.length > MAX_SCENE_TEXT) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parseArrangement(parsed) : null;
  } catch {
    // Not JSON: someone else's value, or a broken one.
    return null;
  }
}

/** A player's saved layouts; anything broken gives the defaults. */
export function parseLayouts(value: unknown): SavedLayouts {
  if (!isRecord(value)) return NO_LAYOUTS;
  const scenes = entries(value.scenes, MAX_SCENES).map(
    ([id, arrangement]) => [id, parseArrangement(arrangement)] as const,
  );
  return {
    own: parseArrangement(value.own),
    scenes: Object.fromEntries(scenes),
  };
}

/** What shows on `scene`: the player's for it, else the scene's, else their own. */
export function sourceOf(
  saved: SavedLayouts,
  scene: SceneLayout | null,
): LayoutSource {
  if (scene && Object.hasOwn(saved.scenes, scene.id)) return "own-scene";
  return scene?.layout ? "scene" : "own";
}

/**
 * The arrangement shown. A scene's tiles win over the player's own; tiles
 * neither has get a free spot. The voice panel is always the player's.
 */
export function arrangementFor(
  saved: SavedLayouts,
  scene: SceneLayout | null,
): Arrangement {
  const source = sourceOf(saved, scene);
  const sceneTiles =
    source === "own-scene" && scene
      ? saved.scenes[scene.id]?.tiles
      : source === "scene"
        ? scene?.layout?.tiles
        : undefined;
  return {
    tiles: { ...saved.own.tiles, ...sceneTiles },
    panel: saved.own.panel,
  };
}

/**
 * The saved layouts after the player moved or resized a tile: on a scene
 * with a GM layout, the player's own copy of it for that scene changes.
 */
export function withTile(
  saved: SavedLayouts,
  scene: SceneLayout | null,
  id: ParticipantId,
  spot: Spot,
): SavedLayouts {
  const source = sourceOf(saved, scene);
  if (source === "own" || !scene)
    return {
      ...saved,
      own: { ...saved.own, tiles: { ...saved.own.tiles, [id]: spot } },
    };
  const base =
    source === "own-scene"
      ? (saved.scenes[scene.id]?.tiles ?? {})
      : (scene.layout?.tiles ?? {});
  return {
    ...saved,
    scenes: {
      ...saved.scenes,
      [scene.id]: { tiles: { ...base, [id]: spot }, panel: null },
    },
  };
}

export const withPanel = (saved: SavedLayouts, spot: Spot): SavedLayouts => ({
  ...saved,
  own: { ...saved.own, panel: spot },
});

/** Back to the scene's layout: the player's copy for it goes. */
export function withoutScene(
  saved: SavedLayouts,
  sceneId: string,
): SavedLayouts {
  const scenes = Object.fromEntries(
    Object.entries(saved.scenes).filter(([id]) => id !== sceneId),
  );
  return { ...saved, scenes };
}

/** Free spots go around the window in this order; the panel has bottom-left. */
const SLOTS: readonly Anchor[] = [
  "top-left",
  "top-right",
  "bottom-right",
  "left",
  "right",
  "top",
  "bottom",
];

/** Gap between a free spot and its edge, and between stacked tiles. */
const SLOT_GAP = 8;

const inward = (anchor: Anchor): readonly [number, number] => [
  anchor.endsWith("left") ? 1 : anchor.endsWith("right") ? -1 : 0,
  anchor.startsWith("bottom") ? -1 : 1,
];

/**
 * The `index`th spot for tiles that have none: the anchors no tile uses
 * first, then each anchor again, stacked inward.
 */
export function freeSpot(index: number, used: ReadonlySet<Anchor>): Spot {
  const free = SLOTS.filter((a) => !used.has(a));
  const width = TILE_WIDTH.default;
  const height = (width * 9) / 16;
  const first = free[index];
  const rest = index - free.length;
  const anchor = first ?? SLOTS[rest % SLOTS.length] ?? "top-left";
  const round = first ? 0 : 1 + Math.floor(rest / SLOTS.length);
  const [sx, sy] = inward(anchor);
  return {
    anchor,
    dx: sx * SLOT_GAP,
    dy: sy * (SLOT_GAP + round * (height + SLOT_GAP)),
    width,
  };
}

export const PANEL_SPOT: Spot = {
  anchor: "bottom-left",
  dx: SLOT_GAP,
  dy: -SLOT_GAP,
  width: 0,
};
