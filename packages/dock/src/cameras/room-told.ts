import type { Insets } from "@modular-av/kit";
import type { ListSpace } from "./list-space.ts";
import { roomUnder } from "./room-under.ts";

/** A 16:9 tile's height, as a fraction of its width. */
const TILE_HEIGHT = 9 / 16;

/** The grid as it was last fitted, and the space it was fitted to. */
export interface Laid {
  readonly fit: {
    readonly columns: number;
    readonly width: number;
    /** The large tile's width, with one tile large. */
    readonly focusWidth: number;
  };
  readonly space: ListSpace;
  /** One tile large over the others. */
  readonly focus: boolean;
}

export interface RoomInput {
  /** The tiles, in the order they are shown. */
  readonly tiles: readonly HTMLElement[];
  /** Where the large tile is in that order; -1 with none. */
  readonly large: number;
  /** Null where there is no grid to measure: scattered tiles, a strip that scrolls sideways. */
  readonly laid: Laid | null;
  /** The room kept round each tile, as fractions of its width. */
  readonly reach: Insets;
}

const sameTiles = (
  a: readonly HTMLElement[],
  b: readonly HTMLElement[],
): boolean => a.length === b.length && a.every((tile, i) => tile === b[i]);

/**
 * Tells a theme the room under the tiles: the height left under the grid
 * (`--mav-dock-spare` on the list, in pixels) and under each tile that
 * ends its column (`--mav-dock-tile-room` on the tile, in tile widths).
 * From what the fit already knows: no layout is read. Nothing is written
 * when the same tiles are told the same thing again.
 */
export function createRoomTeller(
  list: HTMLElement,
): (input: RoomInput) => void {
  let told: { readonly tiles: readonly HTMLElement[]; readonly key: string } = {
    tiles: [],
    key: "",
  };
  return ({ tiles, large, laid, reach }) => {
    const measured = laid && laid.fit.width > 1 ? laid : null;
    const key = JSON.stringify([measured, reach, large]);
    if (key === told.key && sameTiles(tiles, told.tiles)) return;
    told = { tiles: [...tiles], key };
    const row = (width: number): number =>
      width * (TILE_HEIGHT + reach.top + reach.bottom);
    const isLarge = measured?.focus === true && large >= 0;
    const room = measured
      ? roomUnder({
          count: tiles.length,
          columns: measured.fit.columns,
          rowHeight: row(measured.fit.width),
          height: measured.space.height,
          gap: measured.space.gap,
          ...(isLarge
            ? {
                large: {
                  index: large,
                  rowHeight: row(measured.fit.focusWidth),
                },
              }
            : {}),
        })
      : { spare: 0, under: tiles.map(() => 0) };
    list.style.setProperty("--mav-dock-spare", String(Math.floor(room.spare)));
    tiles.forEach((tile, i) => {
      const fit = measured?.fit;
      const width = isLarge && i === large ? fit?.focusWidth : fit?.width;
      const share = (room.under[i] ?? 0) / Math.max(1, width ?? 1);
      tile.style.setProperty(
        "--mav-dock-tile-room",
        String(Number(share.toFixed(3))),
      );
    });
  };
}
