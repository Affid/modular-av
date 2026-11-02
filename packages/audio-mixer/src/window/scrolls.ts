/** What scrolls in a chain: each place's cards, and the faders. */
const SCROLLERS = "[data-rack], .mav-mixer-scroll";

const nameOf = (element: HTMLElement): string =>
  element.dataset.rack ?? "faders";

/**
 * Where each scroller in `root` is now; what it returns puts the redrawn
 * ones back there, so a redraw doesn't jump to the top.
 */
export function keepScrolls(root: HTMLElement): () => void {
  const kept = new Map(
    [...root.querySelectorAll<HTMLElement>(SCROLLERS)].map((element) => [
      nameOf(element),
      { top: element.scrollTop, left: element.scrollLeft },
    ]),
  );
  return () => {
    for (const element of root.querySelectorAll<HTMLElement>(SCROLLERS)) {
      const at = kept.get(nameOf(element));
      if (!at) continue;
      element.scrollTop = at.top;
      element.scrollLeft = at.left;
    }
  };
}
