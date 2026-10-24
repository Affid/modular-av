import type { Size } from "./rect.ts";

/** Video tiles are 16:9. */
const ASPECT: Size = { width: 16, height: 9 };

export interface GridSpace {
  readonly count: number;
  readonly width: number;
  readonly height: number;
  /** Between tiles, both ways. */
  readonly gap: number;
  /** Below this width tiles stop shrinking and the grid scrolls. */
  readonly minTileWidth?: number;
  /** Which way a grid too full to fit scrolls. */
  readonly scroll?: "down" | "sideways";
}

export interface GridFit {
  readonly columns: number;
  /** CSS pixels, not rounded. */
  readonly tileWidth: number;
  readonly scrolls: boolean;
}

const widthForHeight = (height: number): number =>
  (height / ASPECT.height) * ASPECT.width;

const heightForWidth = (width: number): number =>
  (width / ASPECT.width) * ASPECT.height;

/** The largest tile width for each column count, and the best of them. */
function bestFit(space: GridSpace): GridFit {
  let best: GridFit = { columns: 1, tileWidth: 0, scrolls: false };
  for (let columns = 1; columns <= space.count; columns += 1) {
    const rows = Math.ceil(space.count / columns);
    const tileWidth = Math.min(
      (space.width - space.gap * (columns - 1)) / columns,
      widthForHeight((space.height - space.gap * (rows - 1)) / rows),
    );
    if (tileWidth > best.tileWidth)
      best = { columns, tileWidth, scrolls: false };
  }
  return best;
}

/** As many columns (or rows, sideways) as fit at the smallest tile size. */
function scrolling(space: GridSpace, minTileWidth: number): GridFit {
  const { gap, width, height, count } = space;
  if (space.scroll === "sideways") {
    const minHeight = heightForWidth(minTileWidth);
    const rows = Math.max(1, Math.floor((height + gap) / (minHeight + gap)));
    return {
      columns: Math.ceil(count / rows),
      tileWidth: widthForHeight((height - gap * (rows - 1)) / rows),
      scrolls: true,
    };
  }
  const columns = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
  return {
    columns,
    tileWidth: (width - gap * (columns - 1)) / columns,
    scrolls: true,
  };
}

/**
 * The grid of 16:9 tiles that shows `count` videos largest in the space;
 * below `minTileWidth` it scrolls instead of shrinking further.
 */
export function fitGrid(space: GridSpace): GridFit {
  if (space.count <= 0 || space.width <= 0 || space.height <= 0)
    return { columns: 1, tileWidth: 0, scrolls: false };
  const best = bestFit(space);
  const min = space.minTileWidth ?? 0;
  return best.tileWidth < min ? scrolling(space, min) : best;
}

/** The largest 16:9 box in the space, for the focused video. */
export function fitFocus(space: Size): Size {
  const byHeight = widthForHeight(space.height);
  return byHeight <= space.width
    ? { width: byHeight, height: space.height }
    : { width: space.width, height: heightForWidth(space.width) };
}
