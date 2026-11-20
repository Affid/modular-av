/** The room the tiles have, in CSS pixels, and the gap between them. */
export interface ListSpace {
  readonly width: number;
  readonly height: number;
  readonly gap: number;
}

/**
 * The tile list's content box: what is inside its padding, which a theme
 * may add for artwork round the whole grid.
 */
export function listSpace(element: HTMLElement): ListSpace {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const px = (value: string | undefined): number =>
    parseFloat(value ?? "") || 0;
  return {
    width: Math.max(
      0,
      element.clientWidth - px(style?.paddingLeft) - px(style?.paddingRight),
    ),
    height: Math.max(
      0,
      element.clientHeight - px(style?.paddingTop) - px(style?.paddingBottom),
    ),
    gap: px(style?.columnGap),
  };
}
