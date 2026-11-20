/** A grid of tiles as it was fitted: rows of one height, filled in order. */
export interface Rows {
  /** How many tiles, in the order they are shown. */
  readonly count: number;
  readonly columns: number;
  /** A row's height: a tile and the room kept over and under it. */
  readonly rowHeight: number;
  /** The height the tiles have to fill. */
  readonly height: number;
  /** Between rows. */
  readonly gap: number;
  /**
   * One tile large over the rest: where it is in the order, and the
   * height of its row. The others fill the rows under it.
   */
  readonly large?: { readonly index: number; readonly rowHeight: number };
}

export interface RoomUnder {
  /** The height left under the whole grid. */
  readonly spare: number;
  /**
   * For each tile, in order: the height left under it when no tile is
   * under it in its column, otherwise 0.
   */
  readonly under: readonly number[];
}

const stacked = (rows: number, rowHeight: number, gap: number): number =>
  rows > 0 ? rows * rowHeight + (rows - 1) * gap : 0;

/** The room under `count` tiles filling rows of `columns`, `spare` being left under the last row. */
function underRows(
  count: number,
  columns: number,
  step: number,
  spare: number,
): readonly number[] {
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, i) =>
    i + columns < count
      ? 0
      : spare + (rows - 1 - Math.floor(i / columns)) * step,
  );
}

/**
 * How much height is left under a fitted grid, and under each tile that
 * ends its column: what a theme may hang there.
 */
export function roomUnder(rows: Rows): RoomUnder {
  const columns = Math.max(1, rows.columns);
  const others = rows.large ? Math.max(0, rows.count - 1) : rows.count;
  const below = stacked(Math.ceil(others / columns), rows.rowHeight, rows.gap);
  const above = rows.large
    ? rows.large.rowHeight + (below > 0 ? rows.gap : 0)
    : 0;
  const spare = Math.max(0, rows.height - above - below);
  const under = underRows(others, columns, rows.rowHeight + rows.gap, spare);
  if (!rows.large || rows.count === 0) return { spare, under };
  const { index } = rows.large;
  return {
    spare,
    under: [
      ...under.slice(0, index),
      others === 0 ? spare : 0,
      ...under.slice(index),
    ],
  };
}
