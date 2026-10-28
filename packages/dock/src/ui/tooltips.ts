/** Rows and columns of the dock's buttons, whose tooltips are placed. */
const TOOLBARS = ".mav-dock-buttons, .mav-dock-tools";

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

/**
 * Away from the toolbar's own line, toward the middle of the screen: a
 * tooltip under a row of buttons would cover the next one the pointer
 * goes to (Foundry opens them below by default).
 */
function directionOf(toolbar: HTMLElement): Direction {
  const view = toolbar.ownerDocument.defaultView;
  if (!view) return "UP";
  const box = toolbar.getBoundingClientRect();
  if (view.getComputedStyle(toolbar).flexDirection === "column")
    return box.left + box.width / 2 > view.innerWidth / 2 ? "LEFT" : "RIGHT";
  return box.top + box.height / 2 > view.innerHeight / 2 ? "UP" : "DOWN";
}

/**
 * Places the tooltips of `root`'s toolbars away from them as the pointer
 * comes over one (Foundry reads `data-tooltip-direction` from the nearest
 * element that has it), and `hide`s the tooltip shown once a button is
 * clicked: it would sit over the menu the button opens.
 */
export function tooltipsAway(root: HTMLElement, hide: () => void): () => void {
  const over = (event: Event): void => {
    const toolbar = (event.target as Element | null)?.closest<HTMLElement>(
      TOOLBARS,
    );
    if (toolbar && root.contains(toolbar))
      toolbar.dataset.tooltipDirection = directionOf(toolbar);
  };
  const click = (event: Event): void => {
    if ((event.target as Element | null)?.closest("[data-tooltip]")) hide();
  };
  root.addEventListener("pointerover", over);
  root.addEventListener("click", click, true);
  return () => {
    root.removeEventListener("pointerover", over);
    root.removeEventListener("click", click, true);
  };
}
