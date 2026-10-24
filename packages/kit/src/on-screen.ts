import { clamp, type Insets, NO_INSETS, type Rect, type Size } from "./rect.ts";

/** Space kept between a floating box and the window's edges. */
export const SCREEN_MARGIN = 8;

/**
 * The box moved (and shrunk if need be) to lie inside the window, `margin`
 * from its edges, with room for what reaches past it (`reach`).
 */
export function keepOnScreen(
  rect: Rect,
  viewport: Size,
  margin = SCREEN_MARGIN,
  reach: Insets = NO_INSETS,
): Rect {
  const width = Math.min(
    rect.width,
    viewport.width - 2 * margin - reach.left - reach.right,
  );
  const height = Math.min(
    rect.height,
    viewport.height - 2 * margin - reach.top - reach.bottom,
  );
  return {
    width,
    height,
    left: clamp(
      rect.left,
      margin + reach.left,
      viewport.width - width - margin - reach.right,
    ),
    top: clamp(
      rect.top,
      margin + reach.top,
      viewport.height - height - margin - reach.bottom,
    ),
  };
}
