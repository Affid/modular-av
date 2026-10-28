import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { BUILT_IN, chainOf, type Tile, tileOf, tilesOf } from "./chain.ts";
import { button, type View } from "./view.ts";
import { emblem, noteOf, ribbons, statusChip } from "./view-card.ts";

export const DRAWER_ID = "mav-board-drawer";
const INSPECT_ID = "mav-board-inspect";

function tileButton(
  view: View,
  tile: Tile,
  selected: string,
): HTMLButtonElement {
  const { text } = view;
  const flag = tile.inChain
    ? el("span", {
        doc: view.doc,
        className: "flag in",
        text: text.t("chain.inChain"),
      })
    : null;
  const note = noteOf(view, tile);
  const b = el("button", {
    doc: view.doc,
    className: "mav-board-tile",
    attrs: {
      type: "button",
      "data-key": `tile-${tile.id}`,
      "data-stage": tile.stage,
      "data-status": tile.status,
      "aria-pressed": String(selected === tile.id),
      "aria-controls": INSPECT_ID,
      ...(tile.inChain ? { "data-in-chain": "" } : {}),
      ...(tile.locked || tile.status === "soon" ? { "data-locked": "" } : {}),
    },
    children: [
      flag,
      ribbons(view, tile),
      emblem(view, tile.id, tile.stage),
      el("span", {
        doc: view.doc,
        className: "name",
        text: text.name(tile.id),
      }),
      note
        ? el("span", { doc: view.doc, className: "note", text: note })
        : null,
      statusChip(view, tile),
    ],
  });
  b.addEventListener("click", () => {
    view.act.select(tile.id);
  });
  return b;
}

/** What the tile's one action is, in words; null: none (or it is done). */
function actionLabel(view: View, tile: Tile): string | null {
  const { state, text } = view;
  const chain = chainOf(state);
  const name = text.name(tile.id);
  const t = (key: string, data?: Readonly<Record<string, string>>) =>
    text.t(`chain.act.${key}`, data);
  if (tile.status === "soon") return null;
  if (tile.locked && tile.status !== "built-in" && !tile.inChain)
    return t("withParent", { name, parent: text.name(tile.locked) });
  if (tile.stage === "effects") return t(tile.inChain ? "takeOut" : "add");
  if (tile.inChain || tile.locked) return null;
  const current = chain[tile.stage].find((id) => id !== tile.id);
  return current && !current.startsWith("built-in:")
    ? t("instead", { name, current: text.name(current) })
    : t("use", { name });
}

function inspectAction(view: View, tile: Tile): HTMLElement {
  const label = actionLabel(view, tile);
  if (label)
    return button(view, {
      label,
      key: "inspect-act",
      primary: !(tile.stage === "effects" && tile.inChain),
      onClick: () => {
        view.act.choose(tile.id);
      },
    });
  const said =
    tile.status === "soon"
      ? view.text.t("chain.soon")
      : tile.locked
        ? view.text.t("chain.lookNeedsDock")
        : view.text.t(`chain.current.${tile.stage}`);
  return el("p", {
    doc: view.doc,
    className: "mav-board-done",
    attrs: { "data-status": tile.status },
    text: said,
  });
}

function chips(view: View, tile: Tile): HTMLElement {
  const piece = pieceOf(view.state.pieces, tile.id);
  const version = view.state.world.get(tile.id)?.version ?? piece?.version;
  return el("div", {
    doc: view.doc,
    className: "mav-board-chips",
    children: [
      statusChip(view, tile),
      version && piece
        ? el("span", {
            doc: view.doc,
            className: "mav-board-status-chip",
            text: `v${version}`,
          })
        : null,
      ribbons(view, tile),
    ],
  });
}

/** What it does: the core's words, the catalog's, or the built-in's own. */
function what(view: View, id: string): string {
  const piece = pieceOf(view.state.pieces, id);
  if (piece) return view.text.what(piece);
  const soon = view.state.loaded.catalog.soon.find((s) => s.id === id);
  return soon?.description ?? view.text.t(`names.${id}.what`);
}

function facts(view: View, id: string): HTMLElement | null {
  const list = pieceOf(view.state.pieces, id)?.facts ?? [];
  if (!list.length) return null;
  return el("dl", {
    doc: view.doc,
    className: "mav-board-facts",
    children: list.flatMap((f) => [
      el("dt", { doc: view.doc, text: f.label }),
      el("dd", { doc: view.doc, text: f.value }),
    ]),
  });
}

function inspect(view: View, id: string): HTMLElement {
  const tile = tileOf(view.state, id);
  const note = noteOf(view, tile);
  const t = (key: string) => view.text.t(`chain.stage.${tile.stage}.${key}`);
  return el("section", {
    doc: view.doc,
    className: "mav-board-inspect",
    attrs: {
      id: INSPECT_ID,
      "data-stage": tile.stage,
      "aria-label": view.text.name(id),
    },
    children: [
      el("div", {
        doc: view.doc,
        className: "top",
        children: [
          emblem(view, id, tile.stage, "large"),
          el("div", {
            doc: view.doc,
            children: [
              el("h4", { doc: view.doc, text: view.text.name(id) }),
              el("span", {
                doc: view.doc,
                className: "kind",
                text: `${t("label")} · ${t("need")}`,
              }),
            ],
          }),
        ],
      }),
      chips(view, tile),
      note
        ? el("p", {
            doc: view.doc,
            className: "mav-board-plan-line",
            text: note,
          })
        : null,
      el("p", { doc: view.doc, text: what(view, id) }),
      facts(view, id),
      inspectAction(view, tile),
    ],
  });
}

/** The drawer's title (focused when it opens), Done, and what it is for. */
function drawerHead(view: View, t: (key: string) => string): HTMLElement {
  return el("div", {
    doc: view.doc,
    className: "head",
    children: [
      el("h3", {
        doc: view.doc,
        attrs: {
          id: "mav-board-drawer-title",
          tabindex: "-1",
          "data-key": "drawer-title",
        },
        text: t("title"),
      }),
      button(view, {
        label: view.text.t("chain.finish"),
        key: "drawer-close",
        onClick: () => {
          view.act.openStage(null);
        },
      }),
      el("p", { doc: view.doc, className: "hint", text: t("lead") }),
    ],
  });
}

/** An open stage's choices as tiles, and the selected one inspected. */
export function drawer(view: View): HTMLElement | null {
  const stage = view.state.open;
  if (!stage) return null;
  const tiles = tilesOf(view.state, stage);
  const selected =
    tiles.find((tile) => tile.id === view.state.selected)?.id ??
    tiles[0]?.id ??
    BUILT_IN.cameras;
  const t = (key: string) => view.text.t(`chain.drawer.${stage}.${key}`);
  return el("section", {
    doc: view.doc,
    className: "mav-board-drawer",
    attrs: {
      id: DRAWER_ID,
      "data-stage": stage,
      "aria-labelledby": "mav-board-drawer-title",
    },
    children: [
      drawerHead(view, t),
      el("div", {
        doc: view.doc,
        className: "mav-board-loadout",
        children: [
          el("div", {
            doc: view.doc,
            className: "mav-board-tiles",
            attrs: { role: "group", "aria-label": t("title") },
            children: tiles.map((tile) => tileButton(view, tile, selected)),
          }),
          inspect(view, selected),
        ],
      }),
    ],
  });
}
