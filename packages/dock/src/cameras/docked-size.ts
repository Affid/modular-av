import {
  dragToResize,
  type Edge,
  el,
  type Rect,
  setLabel,
  type Size,
} from "@modular-av/kit";
import type { DockContext } from "../context.ts";
import { read, save, SETTINGS } from "../settings.ts";
import type { Side, Where } from "./placement.ts";

/** A player's docked size; null follows the theme's `--mav-dock-*` token. */
export interface DockedSize {
  readonly width: number | null;
  readonly height: number | null;
}

export const DOCKED_MIN: Size = { width: 200, height: 150 };

/** The most of the window a docked dock takes; the CSS keeps it too. */
const MAX_SHARE = 0.5;

/** A saved size beyond this is broken: no screen is that big. */
const MAX_SAVED = 4000;

const NO_SIZE: DockedSize = { width: null, height: null };

const PROPERTIES = {
  width: "--mav-dock-width",
  height: "--mav-dock-height",
} as const;

/** The edge that faces the canvas, the one that resizes. */
const INNER: Readonly<Record<Side, Edge>> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};

const isSide = (where: Where): where is Side => Object.hasOwn(INNER, where);

const axisOf = (side: Side): keyof DockedSize =>
  side === "left" || side === "right" ? "width" : "height";

function parseLength(value: unknown, min: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.min(MAX_SAVED, Math.max(min, value)));
}

/** A saved docked size, each length kept in bounds; anything broken is null. */
export function parseDockedSize(value: unknown): DockedSize {
  if (typeof value !== "object" || value === null) return NO_SIZE;
  const { width, height } = value as Partial<Record<string, unknown>>;
  return {
    width: parseLength(width, DOCKED_MIN.width),
    height: parseLength(height, DOCKED_MIN.height),
  };
}

function apply(host: HTMLElement, size: DockedSize): void {
  for (const axis of ["width", "height"] as const) {
    const length = size[axis];
    if (length === null) host.style.removeProperty(PROPERTIES[axis]);
    else host.style.setProperty(PROPERTIES[axis], `${String(length)}px`);
  }
}

export interface DockedEdge {
  /** A strip along the inner edge: hovering it shows the grip. */
  readonly element: HTMLElement;
  readonly grip: HTMLButtonElement;
}

export function createDockedEdge(ctx: DockContext, doc: Document): DockedEdge {
  const grip = el("button", {
    doc,
    className: "mav-dock-edge-grip",
    attrs: { type: "button" },
  });
  setLabel(grip, ctx.t("dock.resizeDocked"));
  const element = el("div", {
    doc,
    className: "mav-dock-edge",
    children: [grip],
  });
  return { element, grip };
}

/**
 * Docked on a side, the dock's inner edge resizes it: the width on the
 * left or right, the height at the top or bottom, up to half the window.
 * The size is saved per player and set on the host as the theme's token;
 * Home on the grip or a double-click goes back to the theme's.
 */
export function dockedResize(
  ctx: DockContext,
  host: HTMLElement,
  edge: DockedEdge,
  where: () => Where,
): () => void {
  // Read each time: another device may have saved the other side's since.
  const saved = (): DockedSize =>
    parseDockedSize(read(ctx, SETTINGS.dockedSize));
  apply(host, saved());
  const store = (axis: keyof DockedSize, length: number | null): void => {
    const next = { ...saved(), [axis]: length };
    apply(host, next);
    save(ctx, SETTINGS.dockedSize, next);
  };
  const onEnd = (rect: Rect): void => {
    const side = where();
    host.style.removeProperty("width");
    host.style.removeProperty("height");
    if (!isSide(side)) return;
    const axis = axisOf(side);
    const length = Math.round(rect[axis]);
    // Unchanged (a click): a size that follows the theme keeps following it.
    if (length === Math.round(host.getBoundingClientRect()[axis])) return;
    store(axis, length);
  };
  const view = host.ownerDocument.defaultView;
  const options = {
    edges: () => {
      const side = where();
      return isSide(side) ? [INNER[side]] : [];
    },
    min: DOCKED_MIN,
    max: () => ({
      width: (view?.innerWidth ?? Infinity) * MAX_SHARE,
      height: (view?.innerHeight ?? Infinity) * MAX_SHARE,
    }),
    onEnd,
    enabled: () => isSide(where()),
  };
  const reset = (): void => {
    const side = where();
    if (isSide(side) && saved()[axisOf(side)] !== null)
      store(axisOf(side), null);
  };
  const home = (event: KeyboardEvent): void => {
    if (event.key !== "Home") return;
    event.preventDefault();
    reset();
  };
  const undo = [
    dragToResize(edge.element, host, options),
    dragToResize(edge.grip, host, options),
  ];
  edge.element.addEventListener("dblclick", reset);
  edge.grip.addEventListener("keydown", home);
  return () => {
    for (const step of undo) step();
    edge.element.removeEventListener("dblclick", reset);
    edge.grip.removeEventListener("keydown", home);
    apply(host, NO_SIZE);
  };
}
