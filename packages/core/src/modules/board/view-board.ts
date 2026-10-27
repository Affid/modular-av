import { el } from "@modular-av/kit";
import {
  CORE_SOCKETS,
  type Piece,
  pieceOf,
  type Socket,
  socketOf,
} from "../pieces.ts";
import { coreVersion, isUpdatable, badges, button, type View } from "./view.ts";
import { helper } from "./view-helper.ts";

/** The piece being dragged, read by drop targets during the drag. */
const DRAG_TYPE = "text/plain";

/** A piece can be picked up; the board doesn't redraw during a drag. */
export function draggable(view: View, node: HTMLElement, id: string): void {
  node.draggable = true;
  node.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData(DRAG_TYPE, id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    view.act.dragging(id);
  });
  node.addEventListener("dragend", () => {
    view.act.dragging(null);
  });
}

/** Takes a dropped piece that `accepts` lets in. */
export function dropTarget(
  node: HTMLElement,
  accepts: (id: string) => boolean,
  onDrop: (id: string) => void,
): void {
  // During a drag only the type is readable, not the id: the board says.
  node.addEventListener("dragover", (event) => {
    const id = node.ownerDocument.body.dataset.mavDragging ?? "";
    if (!accepts(id)) return;
    event.preventDefault();
    node.dataset.over = "true";
  });
  node.addEventListener("dragleave", () => {
    delete node.dataset.over;
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    delete node.dataset.over;
    const id = event.dataTransfer?.getData(DRAG_TYPE) ?? "";
    if (accepts(id)) onDrop(id);
  });
}

function boardPiece(view: View, piece: Piece, knob: string): HTMLElement {
  const name = view.text.name(piece.id);
  const box = el("div", {
    doc: view.doc,
    className: "mav-board-piece",
    attrs: {
      "data-kind": piece.kind,
      "data-knob": knob,
      "data-planned": String(!view.state.world.get(piece.id)?.active),
    },
    children: [
      el("span", { doc: view.doc, className: "name", text: name }),
      el("p", {
        doc: view.doc,
        className: "what",
        text: view.text.what(piece),
      }),
      badges(view, piece, "board"),
      el("div", {
        doc: view.doc,
        className: "tools",
        children: [
          button(view, {
            label: view.text.t("piece.remove", { name }),
            key: `remove-${piece.id}`,
            onClick: () => {
              view.act.remove(piece.id);
            },
          }),
        ],
      }),
    ],
  });
  draggable(view, box, piece.id);
  return box;
}

/** Sockets that open on a piece (the Dock's theme socket). */
const socketsOn = (pieces: readonly Piece[], id: string): readonly Socket[] => {
  const found = pieces.map(socketOf).filter((s) => s.parent === id);
  return found.filter((s, i) => found.findIndex((o) => o.key === s.key) === i);
};

const KNOBS: Readonly<Record<string, string>> = {
  "core.service": "right",
  "core.cameras": "left",
  "core.effects": "top",
};

/** An empty socket (or room for more): a piece can be dropped on it. */
function hole(
  view: View,
  socket: Socket,
  knob: string,
  occupied: boolean,
): HTMLElement {
  return el("div", {
    doc: view.doc,
    className: "mav-board-socket",
    attrs: { "data-socket": socket.key, "data-knob": knob },
    children: [
      socket.parent
        ? el("p", {
            doc: view.doc,
            className: "label",
            text: view.text.socketLabel(socket),
          })
        : null,
      el("span", {
        doc: view.doc,
        className: "empty",
        text: occupied
          ? view.text.t("board.roomForMore")
          : view.text.socketEmpty(socket),
      }),
    ],
  });
}

/** The pieces in a socket, the sockets that open on them, and its hole. */
export function socketView(view: View, socket: Socket): HTMLElement {
  const { state } = view;
  const knob = KNOBS[socket.key] ?? "left";
  const inIt = state.pieces.filter(
    (p) => state.plan.has(p.id) && socketOf(p).key === socket.key,
  );
  const box = el("div", { doc: view.doc, className: "mav-board-slot" });
  for (const piece of inIt) {
    const children = socketsOn(state.pieces, piece.id);
    box.append(
      boardPiece(view, piece, knob),
      children.length
        ? el("div", {
            doc: view.doc,
            className: "mav-board-children",
            children: children.map((s) => socketView(view, s)),
          })
        : "",
    );
  }
  const fits = (id: string): boolean => {
    const piece = pieceOf(state.pieces, id);
    return (
      piece !== undefined &&
      socketOf(piece).key === socket.key &&
      !state.plan.has(id)
    );
  };
  const add = (id: string): void => {
    view.act.add(id);
  };
  // A full single socket takes a drop on its piece: the new one swaps in.
  const target =
    socket.single && inIt.length > 0
      ? box
      : hole(view, socket, knob, inIt.length > 0);
  if (target !== box) box.append(target);
  dropTarget(target, fits, add);
  return box;
}

function arm(view: View, socket: Socket, extra: readonly Node[]): HTMLElement {
  const missingService =
    socket.key === "core.service" &&
    !view.state.pieces.some(
      (p) => p.kind === "service" && view.state.plan.has(p.id),
    );
  const label = el("div", {
    doc: view.doc,
    className: "mav-board-arm-label",
    children: [
      el("h2", { doc: view.doc, text: view.text.socketLabel(socket) }),
      el("span", {
        doc: view.doc,
        className: missingService ? "need required" : "need",
        text: view.text.socketNeed(socket),
      }),
    ],
  });
  return el("div", {
    doc: view.doc,
    className: `mav-board-arm ${socket.key.replace("core.", "")}`,
    children: [label, ...extra, socketView(view, socket)],
  });
}

function corePiece(view: View): HTMLElement {
  const version = coreVersion(view.state);
  return el("div", {
    doc: view.doc,
    className: "mav-board-core",
    children: [
      el("strong", { doc: view.doc, text: view.text.t("board.core") }),
      el("small", {
        doc: view.doc,
        text: view.text.t(
          isUpdatable(view.state, "modular-av")
            ? "board.coreUpdate"
            : "board.coreVersion",
          { version },
        ),
      }),
    ],
  });
}

/** The core in the middle, a socket for each kind around it. */
export function board(view: View): HTMLElement {
  const { helperOpen } = view.state;
  const helpButton = button(view, {
    label: view.text.t("helper.open"),
    key: "helper-open",
    link: true,
    onClick: () => {
      view.act.helper(true);
    },
  });
  const serviceExtra = helperOpen ? [helper(view)] : [];
  const service = arm(view, CORE_SOCKETS.service, serviceExtra);
  if (!helperOpen) service.firstElementChild?.append(helpButton);
  return el("div", {
    doc: view.doc,
    className: "mav-board-plan",
    attrs: { role: "group", "aria-label": view.text.t("board.label") },
    children: [
      service,
      corePiece(view),
      arm(view, CORE_SOCKETS.ui, []),
      arm(view, CORE_SOCKETS.effect, []),
    ],
  });
}
