import type { Insets, Size } from "./rect.ts";

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
  /**
   * How far frames reach past each tile, as fractions of its width: tiles
   * shrink so their frames fit too.
   */
  readonly reach?: Insets;
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
 * The space scaled down so a fit of bare tiles in it leaves room for
 * their frames in the real one; the gap scales the stricter way.
 */
function withoutFrames(space: GridSpace, reach: Insets): GridSpace {
  const across = 1 + reach.left + reach.right;
  const down = 1 + (reach.top + reach.bottom) * (ASPECT.width / ASPECT.height);
  return {
    count: space.count,
    width: space.width / across,
    height: space.height / down,
    gap: space.gap / Math.min(across, down),
    ...(space.minTileWidth === undefined
      ? {}
      : { minTileWidth: space.minTileWidth }),
    ...(space.scroll ? { scroll: space.scroll } : {}),
  };
}

/**
 * The grid of 16:9 tiles that shows `count` videos largest in the space;
 * below `minTileWidth` it scrolls instead of shrinking further.
 */
export function fitGrid(space: GridSpace): GridFit {
  if (space.count <= 0 || space.width <= 0 || space.height <= 0)
    return { columns: 1, tileWidth: 0, scrolls: false };
  if (space.reach) return fitGrid(withoutFrames(space, space.reach));
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

export interface SpeakerFit {
  /** Thumbnail columns (down) or rows (sideways) the large tile spans. */
  readonly span: number;
  /** CSS pixels, not rounded. */
  readonly focusWidth: number;
  readonly thumbWidth: number;
}

/** Thumbnails stop shrinking here; below, the list scrolls. */
const MIN_THUMB_WIDTH = 96;

/** At least this many thumbnails across under a large tile: a third of it. */
const MIN_THUMB_COLUMNS = 3;

/** Under the large tile: `columns` thumbnails across, `rows` rows of them. */
function speakerDown(space: GridSpace, others: number): SpeakerFit {
  const { width, height, gap } = space;
  const min = space.minTileWidth ?? MIN_THUMB_WIDTH;
  const fitting = Math.max(1, Math.floor((width + gap) / (min + gap)));
  const span = Math.max(
    1,
    Math.min(Math.max(MIN_THUMB_COLUMNS, others), fitting),
  );
  const rows = Math.ceil(others / span);
  const byWidth = (width - gap * (span - 1)) / span;
  // The large tile and the rows under it, all 16:9, fill the height.
  const byHeight =
    (height - gap * rows - heightForWidth(gap * (span - 1))) /
    heightForWidth(span + rows);
  const thumbWidth = Math.max(
    Math.min(byWidth, byHeight),
    Math.min(byWidth, min),
  );
  return { span, thumbWidth, focusWidth: span * thumbWidth + gap * (span - 1) };
}

/** Beside the large tile: `span` rows of thumbnails, as tall as it. */
function speakerSideways(space: GridSpace): SpeakerFit {
  const { width, height, gap } = space;
  const twoRows = widthForHeight((height - gap) / 2);
  const span = twoRows >= MIN_THUMB_WIDTH ? 2 : 1;
  const byHeight = widthForHeight((height - gap * (span - 1)) / span);
  const byWidth = (width - gap * (span - 1)) / span;
  const thumbWidth = Math.min(byHeight, byWidth);
  return { span, thumbWidth, focusWidth: span * thumbWidth + gap * (span - 1) };
}

/**
 * One player large and everyone else as thumbnails: under the large tile
 * in a dock that scrolls down, in rows beside it in one that scrolls
 * sideways. The large tile spans `span` thumbnail columns (or rows).
 */
export function fitSpeaker(space: GridSpace): SpeakerFit {
  if (space.count <= 0 || space.width <= 0 || space.height <= 0)
    return { span: 1, focusWidth: 0, thumbWidth: 0 };
  if (space.reach) return fitSpeaker(withoutFrames(space, space.reach));
  const others = space.count - 1;
  if (others === 0) {
    const { width } = fitFocus(space);
    return { span: 1, focusWidth: width, thumbWidth: width };
  }
  return space.scroll === "sideways"
    ? speakerSideways(space)
    : speakerDown(space, others);
}
