import type { ModuleKind } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { type Piece, socketOf } from "../pieces.ts";
import { badges, button, type View } from "./view.ts";
import { draggable, dropTarget } from "./view-board.ts";

const GROUPS: readonly ModuleKind[] = ["service", "ui", "effect", "theme"];

/** Its button: add it, swap it in, or wait for what it hangs off. */
function addButton(view: View, piece: Piece): HTMLButtonElement {
  const { state, text } = view;
  const socket = socketOf(piece);
  const waitsFor =
    socket.parent !== null && !state.plan.has(socket.parent)
      ? socket.parent
      : null;
  const current = state.pieces.find(
    (p) =>
      p.id !== piece.id &&
      state.plan.has(p.id) &&
      socketOf(p).key === socket.key,
  );
  const label = waitsFor
    ? text.t("piece.needs", { name: text.name(waitsFor) })
    : socket.single && current
      ? text.t("piece.instead", { name: text.name(current.id) })
      : text.t("piece.add", { socket: text.socketLabel(socket) });
  return button(view, {
    label,
    key: `add-${piece.id}`,
    disabled: waitsFor !== null,
    onClick: () => {
      view.act.add(piece.id);
    },
  });
}

function trayPiece(view: View, piece: Piece): HTMLElement {
  const add = addButton(view, piece);
  const box = el("div", {
    doc: view.doc,
    className: "mav-board-piece",
    attrs: { "data-kind": piece.kind, "data-knob": "top" },
    children: [
      el("span", {
        doc: view.doc,
        className: "name",
        text: view.text.name(piece.id),
      }),
      el("p", {
        doc: view.doc,
        className: "what",
        text: view.text.what(piece),
      }),
      badges(view, piece, "tray"),
      el("div", { doc: view.doc, className: "tools", children: [add] }),
    ],
  });
  if (!add.disabled) draggable(view, box, piece.id);
  return box;
}

function group(view: View, kind: ModuleKind): HTMLElement {
  const { state, text } = view;
  const ofKind = state.pieces.filter((p) => p.kind === kind);
  const loose = ofKind.filter((p) => !state.plan.has(p.id));
  const onBoard = ofKind.filter((p) => state.plan.has(p.id)).map((p) => p.id);
  const empty = onBoard.length
    ? text.t("tray.onBoard", { names: text.names(onBoard) })
    : text.t("tray.none");
  return el("div", {
    doc: view.doc,
    className: "mav-board-group",
    children: [
      el("p", {
        doc: view.doc,
        className: "label",
        text: text.t(`tray.${kind}`),
      }),
      ...(loose.length
        ? loose.map((p) => trayPiece(view, p))
        : [el("p", { doc: view.doc, className: "hint", text: empty })]),
    ],
  });
}

/** The pieces not on the board, a column per kind; drop one here to remove it. */
export function tray(view: View): HTMLElement {
  const { text, state } = view;
  const soon = state.loaded.catalog.soon.map((s) => s.id);
  const section = el("section", {
    doc: view.doc,
    className: "mav-board-tray",
    attrs: { "aria-label": text.t("tray.label") },
    children: [
      el("h2", { doc: view.doc, text: text.t("tray.title") }),
      el("p", { doc: view.doc, className: "hint", text: text.t("tray.hint") }),
      el("div", {
        doc: view.doc,
        className: "mav-board-groups",
        children: GROUPS.map((kind) => group(view, kind)),
      }),
      soon.length
        ? el("p", {
            doc: view.doc,
            className: "soon",
            text: text.t("tray.soon", { names: text.names(soon) }),
          })
        : null,
    ],
  });
  dropTarget(
    section,
    (id) => state.plan.has(id),
    (id) => {
      view.act.remove(id);
    },
  );
  return section;
}
