import { clamp, type Rect, type Size } from "./rect.ts";

export interface PopoverPlacement {
  readonly anchor: Rect;
  /** The popover's natural size. */
  readonly size: Size;
  /** The window it opens in, which may be the Picture-in-Picture window. */
  readonly viewport: Size;
  /** Between the anchor and the popover. */
  readonly gap?: number;
  /** Between the popover and the window's edges. */
  readonly margin?: number;
}

export interface PopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly side: "above" | "below";
  /** The height there is on that side: taller content scrolls. */
  readonly room: number;
}

/**
 * Where a popover goes: above its anchor if it fits there or that side
 * has more room, else below, never covering the anchor; aligned with the
 * anchor's left edge and kept inside the window.
 */
export function placePopover(placement: PopoverPlacement): PopoverPosition {
  const { anchor, size, viewport } = placement;
  const gap = placement.gap ?? 8;
  const margin = placement.margin ?? 8;
  const roomAbove = anchor.top - margin - gap;
  const roomBelow =
    viewport.height - (anchor.top + anchor.height) - margin - gap;
  const above = roomAbove >= size.height || roomAbove >= roomBelow;
  const room = Math.max(0, above ? roomAbove : roomBelow);
  const height = Math.min(size.height, room);
  const top = above
    ? anchor.top - height - gap
    : anchor.top + anchor.height + gap;
  return {
    left: clamp(anchor.left, margin, viewport.width - size.width - margin),
    top,
    side: above ? "above" : "below",
    room,
  };
}
