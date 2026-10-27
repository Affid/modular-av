import type { Rect } from "@modular-av/kit";

/**
 * Foundry v14's own controls, which scattered tiles keep clear of: the
 * sidebar, scene controls, players list, scene navigation, hotbar, and
 * the chat input and recent messages shown while the sidebar is collapsed.
 */
export const FOUNDRY_CONTROLS = [
  "#sidebar",
  "#scene-controls",
  "#players",
  "#scene-navigation",
  "#hotbar",
  "#chat-notifications",
] as const;

/** Those of Foundry's controls that are on screen now, as boxes. */
export function measureControls(doc: Document): readonly Rect[] {
  return FOUNDRY_CONTROLS.flatMap((selector) => {
    const element = doc.querySelector(selector);
    if (!element) return [];
    const { left, top, width, height } = element.getBoundingClientRect();
    return width > 0 && height > 0 ? [{ left, top, width, height }] : [];
  });
}

/** The controls' elements, to watch for size changes (the sidebar collapsing). */
export const controlElements = (doc: Document): readonly Element[] =>
  FOUNDRY_CONTROLS.flatMap((selector) => {
    const element = doc.querySelector(selector);
    return element ? [element] : [];
  });
