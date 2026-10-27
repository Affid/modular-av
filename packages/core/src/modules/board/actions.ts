import type { BoardHost } from "../host.ts";
import { pieceOf, piecesOf } from "../pieces.ts";
import { type Plan, withoutPiece, withPiece } from "../plan.ts";
import { applicable, planDiff, runningOf } from "../steps.ts";
import { type BoardState, type Confirming, toSave } from "./state.ts";
import type { Texts } from "./texts.ts";
import type { Actions } from "./view.ts";
import { ANSWERS } from "./view-helper.ts";

/** How actions reach the board: its state, a re-render, a toast. */
export interface Board {
  readonly host: BoardHost;
  state(): BoardState;
  texts(): Texts;
  /** Replaces the state and re-renders, focus on `focus` (a data-key). */
  set(next: BoardState, focus?: string): void;
  toast(message: string, withUndo?: boolean): void;
  /** Marks the sockets a picked-up piece fits. */
  markFits(id: string | null): void;
}

/** Reports an action's failure; the board stays as it was. */
const failed =
  (board: Board) =>
  (error: unknown): void => {
    board.host.onError(error);
  };

const save = (board: Board): void => {
  board.host.savePlan(toSave(board.state())).catch(failed(board));
};

function change(board: Board, plan: Plan, message: string, focus: string) {
  const state = board.state();
  board.set(
    {
      ...state,
      plan,
      history: [...state.history, state.plan],
      confirming: null,
    },
    focus,
  );
  board.toast(message, true);
  save(board);
}

/** Where focus goes when an inline confirmation closes. */
const afterConfirm = (from: Confirming): string =>
  from === "leave" ? "go-setup" : "apply";

async function leave(board: Board): Promise<void> {
  const state = board.state();
  const trip = planDiff(state.plan, state.world).install;
  await board.host.savePlan({ plan: [...state.plan], trip });
  await board.host.returnToSetup();
}

/** Applies what can be now; the plan stays saved if anything waits. */
async function apply(board: Board): Promise<void> {
  const state = board.state();
  const a = applicable(state.plan, state.world, state.pieces);
  const ui = a.on.find((id) => pieceOf(state.pieces, id)?.kind === "ui");
  const waits = a.waiting.length + a.keep.length > 0;
  const kept = { plan: [...state.plan], trip: state.trip };
  await board.host.savePlan(waits ? kept : null);
  try {
    await board.host.apply({ on: a.on, off: a.off, ui: ui ?? null });
  } catch (error: unknown) {
    // Nothing changed for good: the plan is still to be applied.
    await board.host.savePlan(kept);
    throw error;
  }
}

function planActions(
  board: Board,
): Pick<Actions, "add" | "remove" | "undo" | "undoAll"> {
  const t = () => board.texts();
  return {
    add(id) {
      const state = board.state();
      const next = withPiece(state.plan, id, state.pieces);
      if (next.plan === state.plan) return;
      const name = t().name(id);
      const message = next.dropped.length
        ? t().t("piece.swapped", { name, dropped: t().names(next.dropped) })
        : t().t("piece.added", { name });
      change(board, next.plan, message, `remove-${id}`);
    },
    remove(id) {
      const state = board.state();
      const next = withoutPiece(state.plan, id, state.pieces);
      if (next.plan === state.plan) return;
      const message = t().t("piece.removed", {
        names: t().names(next.removed),
      });
      change(board, next.plan, message, `add-${id}`);
    },
    undo() {
      const state = board.state();
      const previous = state.history.at(-1);
      if (!previous) return;
      const history = state.history.slice(0, -1);
      board.set(
        { ...state, plan: previous, history, confirming: null },
        "status",
      );
      board.toast(t().t("status.undone"));
      save(board);
    },
    undoAll() {
      change(
        board,
        runningOf(board.state().world),
        t().t("status.backToWorld"),
        "status",
      );
    },
  };
}

function tripActions(
  board: Board,
): Pick<Actions, "confirm" | "leave" | "apply"> {
  // Leaving and applying run once, however often their button is pressed.
  let working = false;
  const once = (run: (board: Board) => Promise<void>): void => {
    if (working) return;
    working = true;
    run(board)
      .catch(failed(board))
      .finally(() => {
        working = false;
      });
  };
  return {
    confirm(which) {
      const state = board.state();
      board.set(
        { ...state, confirming: which },
        which ? `${which}-ok` : afterConfirm(state.confirming),
      );
      if (!which && state.confirming === "apply")
        board.toast(board.texts().t("steps.world.kept"));
    },
    leave() {
      once(leave);
    },
    apply() {
      once(apply);
    },
  };
}

function carryActions(
  board: Board,
): Pick<Actions, "copy" | "saveFile" | "chat" | "retry"> {
  const t = (key: string) => board.texts().t(`steps.setup.${key}`);
  return {
    copy(text) {
      board.host.copy(text).then(
        () => {
          board.toast(t("copied"));
        },
        () => {
          board.toast(t("copyFailed"));
        },
      );
    },
    saveFile(text) {
      board.host.saveFile(text);
    },
    chat(text) {
      board.host
        .whisper(text)
        .then(() => {
          board.set({ ...board.state(), chatSent: true }, "go-setup");
          board.toast(t("chatDone"));
        })
        .catch(failed(board));
    },
    retry() {
      board.host
        .loadCatalog(true)
        .then((loaded) => {
          const pieces = piecesOf(loaded.catalog);
          board.set({ ...board.state(), loaded, pieces }, "status");
        })
        .catch(failed(board));
    },
  };
}

export function createActions(board: Board): Actions {
  const answerKey = (id: string): string =>
    `helper-${ANSWERS.find((a) => a.id === id)?.answer ?? ""}`;
  return {
    ...planActions(board),
    ...tripActions(board),
    ...carryActions(board),
    helper(open) {
      const state = board.state();
      board.set(
        { ...state, helperOpen: open },
        open ? answerKey(state.answer ?? ANSWERS[0].id) : "helper-open",
      );
    },
    answer(id) {
      board.set({ ...board.state(), answer: id }, answerKey(id));
    },
    dragging(id) {
      board.markFits(id);
    },
  };
}
