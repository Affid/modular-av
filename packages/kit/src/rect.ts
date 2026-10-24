/** A box in CSS pixels, from the top left of its window. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** How far something reaches past a box on each side, e.g. a frame. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** `value` within `min` and `max`; `min` wins if they cross. */
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

/** A window's size, for the element that lives in it. */
export function viewportOf(element: Element): Size {
  const view = element.ownerDocument.defaultView;
  return { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 };
}
