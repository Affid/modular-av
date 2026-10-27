import { el } from "@modular-av/kit";
import type { BoardHost } from "../host.ts";
import { pieceOf, socketOf } from "../pieces.ts";
import { type Board, createActions } from "./actions.ts";
import { type BoardState, initialState } from "./state.ts";
import { createTexts, type Texts } from "./texts.ts";
import type { Actions, View } from "./view.ts";
import { board as boardView } from "./view-board.ts";
import { sourceLine, statusBar, updatesNotice } from "./view-status.ts";
import { steps } from "./view-steps.ts";
import { tray } from "./view-tray.ts";

/** How long a toast stays, unless another replaces it. */
const TOAST_MS = 6000;

export interface MountedBoard {
  dispose(): void;
}

function toaster(doc: Document, undo: () => void, text: () => Texts) {
  const element = el("div", {
    doc,
    className: "mav-board-toast",
    attrs: { role: "status", "aria-live": "polite", hidden: "" },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (message: string, withUndo = false): void => {
    const undoButton = el("button", {
      doc,
      className: "mav-board-button link",
      text: text().t("status.undo"),
      attrs: { type: "button" },
    });
    undoButton.addEventListener("click", undo);
    element.replaceChildren(
      el("span", { doc, text: message }),
      withUndo ? undoButton : "",
    );
    element.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      element.hidden = true;
    }, TOAST_MS);
  };
  return {
    element,
    show,
    stop: () => {
      clearTimeout(timer);
    },
  };
}

function render(content: HTMLElement, view: View, toast: HTMLElement): void {
  content.replaceChildren(
    el("div", {
      doc: view.doc,
      className: "mav-board",
      children: [
        el("p", {
          doc: view.doc,
          className: "lead",
          text: view.text.t("lead"),
        }),
        sourceLine(view),
        updatesNotice(view),
        statusBar(view),
        boardView(view),
        tray(view),
        steps(view),
      ],
    }),
    toast,
  );
}

/** Shows which sockets a picked-up piece fits; null puts it down. */
function markFits(
  content: HTMLElement,
  state: BoardState,
  id: string | null,
): void {
  const body = content.ownerDocument.body;
  if (id) body.dataset.mavDragging = id;
  else delete body.dataset.mavDragging;
  const piece = id ? pieceOf(state.pieces, id) : undefined;
  const key = piece && !state.plan.has(piece.id) ? socketOf(piece).key : "";
  for (const hole of content.querySelectorAll<HTMLElement>("[data-socket]"))
    hole.dataset.fits = String(hole.dataset.socket === key);
}

/** Ctrl+Z (Cmd+Z) undoes, except while typing in a field. */
function undoKey(undo: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    const typing =
      event.target instanceof HTMLInputElement && event.target.type !== "radio";
    const z = event.key.toLowerCase() === "z";
    if (!(event.ctrlKey || event.metaKey) || !z || typing) return;
    event.preventDefault();
    undo();
  };
}

/**
 * The assembly board in `content`: loads the catalog, shows the plan,
 * redraws after every action with focus where the action leads.
 */
export async function mountBoard(
  host: BoardHost,
  content: HTMLElement,
): Promise<MountedBoard> {
  const doc = host.doc;
  let state: BoardState = initialState(host, await host.loadCatalog());
  let texts = createTexts(host, state.pieces, state.loaded.catalog.soon);
  let actions: Actions | null = null;
  const undo = (): void => {
    actions?.undo();
  };
  const toast = toaster(doc, undo, () => texts);
  const draw = (focus?: string): void => {
    texts = createTexts(host, state.pieces, state.loaded.catalog.soon);
    if (!actions) return;
    const view = { doc, host, state, text: texts, act: actions };
    render(content, view, toast.element);
    if (focus)
      content.querySelector<HTMLElement>(`[data-key="${focus}"]`)?.focus();
  };
  const board: Board = {
    host,
    state: () => state,
    texts: () => texts,
    set(next, focus) {
      state = next;
      draw(focus);
    },
    toast: toast.show,
    markFits: (id) => {
      markFits(content, state, id);
    },
  };
  actions = createActions(board);
  const onKey = undoKey(undo);
  content.addEventListener("keydown", onKey);
  draw();
  return {
    dispose() {
      content.removeEventListener("keydown", onKey);
      toast.stop();
      delete doc.body.dataset.mavDragging;
    },
  };
}
