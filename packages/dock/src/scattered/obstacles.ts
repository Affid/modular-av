import type { Rect } from "@modular-av/kit";

/**
 * The visible parts of Foundry v14's own controls, which scattered tiles
 * keep clear of: one box for each group. The containers themselves are
 * tall and mostly empty (`#scene-navigation` and `#chat-notifications`
 * run the whole height of the window), so their items are measured. The
 * sidebar's content slides off to the right when collapsed, while
 * `#sidebar` keeps its box.
 */
const PARTS: readonly string[] = [
  "#sidebar-tabs menu > li",
  "#sidebar-content",
  "#scene-controls-layers > li",
  "#scene-controls-tools > li",
  "#scene-navigation-active > li",
  "#scene-navigation-inactive > li",
  // Its names overflow its own box: everything in it counts.
  "#players, #players *",
  "#hotbar",
  "#chat-notifications .chat-log",
  "#chat-message",
  "#chat-controls",
];

/** The containers of those parts, watched for changes. */
export const FOUNDRY_CONTROLS: readonly string[] = [
  "#sidebar",
  "#scene-controls",
  "#players",
  "#scene-navigation",
  "#hotbar",
  "#chat-notifications",
];

interface Checkable {
  checkVisibility?(options: object): boolean;
}

/** Laid out, not `visibility: hidden` and not faded out entirely. */
const visible = (element: Element): boolean =>
  (element as Checkable).checkVisibility?.({
    visibilityProperty: true,
    opacityProperty: true,
  }) ?? true;

/** The smallest box around every box given, or null for none. */
function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

const boxOf = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

/** Those of Foundry's controls that show now, as boxes. */
export function measureControls(doc: Document): readonly Rect[] {
  return PARTS.flatMap((selector) => {
    const parts = Array.from(doc.querySelectorAll(selector))
      .filter(visible)
      .map(boxOf)
      .filter((r) => r.width > 0 && r.height > 0);
    const box = union(parts);
    return box ? [box] : [];
  });
}

/** The controls' containers, to watch for changes. */
export const controlElements = (doc: Document): readonly Element[] =>
  FOUNDRY_CONTROLS.flatMap((selector) => {
    const element = doc.querySelector(selector);
    return element ? [element] : [];
  });
