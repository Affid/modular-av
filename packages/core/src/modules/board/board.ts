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
    attrs: { role: "status", "aria-live": "polite" },
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
    // Always in the page, emptied rather than hidden: a live region that
    // appears with its text is often not read out.
    clearTimeout(timer);
    timer = setTimeout(() => {
      element.replaceChildren();
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

/** Redraws the board in `root`; the toast beside it stays put. */
function render(root: HTMLElement, view: View): void {
  root.replaceChildren(
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

/** Puts focus on what an action leads to, by its data-key. */
const focusOn = (root: HTMLElement, key: string): void => {
  root.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
};

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
  // Closed: answers that arrive late (a whisper, a retry) change nothing.
  let disposed = false;
  const undo = (): void => {
    actions?.undo();
  };
  const toast = toaster(doc, undo, () => texts);
  const root = el("div", { doc });
  content.replaceChildren(root, toast.element);
  const draw = (focus?: string): void => {
    texts = createTexts(host, state.pieces, state.loaded.catalog.soon);
    if (!actions || disposed) return;
    const view = { doc, host, state, text: texts, act: actions };
    render(root, view);
    if (focus) focusOn(root, focus);
  };
  const board: Board = {
    host,
    state: () => state,
    texts: () => texts,
    set(next, focus) {
      state = next;
      draw(focus);
    },
    toast: (message, withUndo) => {
      if (!disposed) toast.show(message, withUndo);
    },
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
      disposed = true;
      content.removeEventListener("keydown", onKey);
      toast.stop();
      delete doc.body.dataset.mavDragging;
    },
  };
}
