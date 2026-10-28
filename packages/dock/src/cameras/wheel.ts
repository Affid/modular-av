/** A wheel that scrolls by lines: one line in CSS pixels. */
const LINE = 16;
const DOM_DELTA_LINE = 1;

/**
 * A mouse wheel turned over `element` scrolls it sideways while
 * `enabled()` and it overflows that way. Ctrl (the browser's zoom) and
 * sideways wheels and trackpads keep their own scrolling.
 */
export function wheelSideways(
  element: HTMLElement,
  enabled: () => boolean,
): () => void {
  const wheel = (event: WheelEvent): void => {
    const overflows = element.scrollWidth > element.clientWidth;
    const upright = Math.abs(event.deltaY) > Math.abs(event.deltaX);
    if (!enabled() || !overflows || !upright || event.ctrlKey) return;
    event.preventDefault();
    const scale = event.deltaMode === DOM_DELTA_LINE ? LINE : 1;
    element.scrollLeft += event.deltaY * scale;
  };
  element.addEventListener("wheel", wheel, { passive: false });
  return () => {
    element.removeEventListener("wheel", wheel);
  };
}
