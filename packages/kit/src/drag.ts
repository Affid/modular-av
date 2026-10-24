import { keepOnScreen } from "./on-screen.ts";
import { type Rect, type Size, viewportOf } from "./rect.ts";

/** Drags that start on these stay theirs: a button in a header still clicks. */
const CONTROLS = "button, input, select, textarea, a";

/** Keyboard steps in CSS pixels; Shift takes the big one. */
const STEP = 10;
const BIG_STEP = 50;

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface Drag {
  /** False: the drag doesn't start (e.g. the dock is docked). */
  enabled(): boolean;
  start(): void;
  move(dx: number, dy: number): void;
  end(): void;
}

/** A pointer drag with the primary button, from `handle`. */
function onPointerDrag(handle: HTMLElement, drag: Drag): () => void {
  const down = (event: PointerEvent): void => {
    const from = event.target as Element | null;
    const control = from?.closest(CONTROLS);
    if (event.button !== 0 || (control && control !== handle)) return;
    if (!drag.enabled()) return;
    event.preventDefault();
    const { clientX: x, clientY: y, pointerId } = event;
    handle.setPointerCapture(pointerId);
    drag.start();
    const move = (e: PointerEvent): void => {
      drag.move(e.clientX - x, e.clientY - y);
    };
    const end = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      drag.end();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };
  handle.addEventListener("pointerdown", down);
  return () => {
    handle.removeEventListener("pointerdown", down);
  };
}

/** The arrow keys on the focused `handle`, as one step of a drag each. */
function onKeyboardDrag(handle: HTMLElement, drag: Drag): () => void {
  const key = (event: KeyboardEvent): void => {
    const arrow = ARROWS[event.key];
    if (!arrow || event.target !== handle || !drag.enabled()) return;
    event.preventDefault();
    const step = event.shiftKey ? BIG_STEP : STEP;
    drag.start();
    drag.move(arrow[0] * step, arrow[1] * step);
    drag.end();
  };
  handle.addEventListener("keydown", key);
  return () => {
    handle.removeEventListener("keydown", key);
  };
}

function bothWays(handle: HTMLElement, drag: Drag): () => void {
  const undo = [onPointerDrag(handle, drag), onKeyboardDrag(handle, drag)];
  return () => {
    for (const step of undo) step();
  };
}

const boxOf = (element: HTMLElement): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

const px = (value: number): string => `${String(Math.round(value))}px`;

/**
 * Moves a fixed-position `target` by dragging `handle`, or with the arrow
 * keys while the handle has the focus, kept on screen. `onEnd` gets the
 * box where it ended, to save.
 */
export function dragToMove(
  handle: HTMLElement,
  target: HTMLElement,
  options: {
    readonly onEnd: (rect: Rect) => void;
    readonly enabled?: () => boolean;
  },
): () => void {
  let start: Rect = boxOf(target);
  return bothWays(handle, {
    enabled: options.enabled ?? (() => true),
    start() {
      start = boxOf(target);
      target.toggleAttribute("data-dragging", true);
    },
    move(dx, dy) {
      const rect = keepOnScreen(
        { ...start, left: start.left + dx, top: start.top + dy },
        viewportOf(target),
      );
      target.style.left = px(rect.left);
      target.style.top = px(rect.top);
    },
    end() {
      target.toggleAttribute("data-dragging", false);
      options.onEnd(boxOf(target));
    },
  });
}

export type Edge = "top" | "right" | "bottom" | "left";

/**
 * Resizes `target` by dragging `handle` (or with its arrow keys) on the
 * edges `edges()` names when the drag starts.
 */
export function dragToResize(
  handle: HTMLElement,
  target: HTMLElement,
  options: {
    readonly edges: () => readonly Edge[];
    readonly min: Size;
    readonly onEnd: (rect: Rect) => void;
    readonly enabled?: () => boolean;
  },
): () => void {
  let start: Rect = boxOf(target);
  let edges: readonly Edge[] = [];
  const { min } = options;
  return bothWays(handle, {
    enabled: options.enabled ?? (() => true),
    start() {
      start = boxOf(target);
      edges = options.edges();
      target.toggleAttribute("data-resizing", true);
    },
    move(dx, dy) {
      const width = edges.includes("left")
        ? start.width - dx
        : start.width + dx;
      const height = edges.includes("top")
        ? start.height - dy
        : start.height + dy;
      if (edges.includes("left") || edges.includes("right"))
        target.style.width = px(Math.max(width, min.width));
      if (edges.includes("top") || edges.includes("bottom"))
        target.style.height = px(Math.max(height, min.height));
    },
    end() {
      target.toggleAttribute("data-resizing", false);
      options.onEnd(boxOf(target));
    },
  });
}
