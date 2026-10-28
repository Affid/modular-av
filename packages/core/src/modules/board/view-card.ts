import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { BUILT_IN, type Stage, type Tile } from "./chain.ts";
import type { View } from "./view.ts";

/** A kind's own icon, for modules whose manifest names none. */
const STAGE_ICONS: Readonly<Record<Stage, string>> = {
  effects: "fa-solid fa-wand-magic-sparkles",
  service: "fa-solid fa-phone-volume",
  cameras: "fa-solid fa-table-cells-large",
  look: "fa-solid fa-palette",
};

const BUILT_IN_ICONS: Readonly<Record<string, string>> = {
  [BUILT_IN.cameras]: "fa-solid fa-video",
  [BUILT_IN.look]: "fa-regular fa-square",
};

/** The module's Font Awesome icon, or its stage's. */
export function iconOf(view: View, id: string, stage: Stage): string {
  return (
    BUILT_IN_ICONS[id] ??
    pieceOf(view.state.pieces, id)?.icon ??
    STAGE_ICONS[stage]
  );
}

/** A hexagonal emblem tinted by the stage, with the module's icon. */
export function emblem(
  view: View,
  id: string,
  stage: Stage,
  size: "small" | "large" = "small",
): HTMLElement {
  return el("span", {
    doc: view.doc,
    className: `mav-board-emblem ${size}`,
    attrs: { "data-stage": id.startsWith("built-in:") ? "built-in" : stage },
    children: [
      el("i", {
        doc: view.doc,
        className: iconOf(view, id, stage),
        attrs: { "aria-hidden": "true" },
      }),
    ],
  });
}

/** Running, installed and off, not installed, built in, or coming soon. */
export function statusChip(view: View, tile: Tile): HTMLElement {
  return el("span", {
    doc: view.doc,
    className: "mav-board-status-chip",
    attrs: { "data-status": tile.status },
    text: view.text.t(`chain.status.${tile.status}`),
  });
}

/** What going live does to it, if anything. */
export function noteOf(view: View, tile: Tile): string | null {
  if (tile.status === "built-in")
    return view.text.t(
      tile.id === BUILT_IN.cameras ? "chain.always" : "chain.withDock",
    );
  if (tile.locked)
    return view.text.t("chain.needs", { name: view.text.name(tile.locked) });
  return tile.note ? view.text.t(`chain.note.${tile.note}`) : null;
}

/** Update and New, as ribbons on a card or a tile. */
export function ribbons(view: View, tile: Tile): HTMLElement | null {
  const list = [
    tile.update ? ["update", view.text.t("chain.ribbon.update")] : null,
    tile.isNew && tile.status === "missing"
      ? ["new", view.text.t("chain.ribbon.new")]
      : null,
  ].filter((r): r is string[] => r !== null);
  if (!list.length) return null;
  return el("span", {
    doc: view.doc,
    className: "mav-board-ribbons",
    children: list.map(([kind, label]) =>
      el("span", {
        doc: view.doc,
        className: `mav-board-ribbon ${kind ?? ""}`,
        text: label ?? "",
      }),
    ),
  });
}
