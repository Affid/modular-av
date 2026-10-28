import type { BoardHost } from "../host.ts";
import { pieceOf, piecesOf } from "../pieces.ts";
import type { Plan } from "../plan.ts";
import { applicable, planDiff } from "../steps.ts";
import { BUILDS, withBuild } from "./builds.ts";
import { type Choice, choose, tileOf, tilesOf } from "./chain.ts";
import {
  type BoardState,
  type Confirming,
  runningPlan,
  toSave,
} from "./state.ts";
import type { Texts } from "./texts.ts";
import type { Actions } from "./view.ts";

/** How actions reach the board: its state, a re-render, a toast. */
export interface Board {
  readonly host: BoardHost;
  state(): BoardState;
  texts(): Texts;
  /** Replaces the state and re-renders, focus on `focus` (a data-key). */
  set(next: BoardState, focus?: string): void;
  toast(message: string, withUndo?: boolean): void;
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
    // Nothing changed for good: the plan is still to be applied. A failed
    // restore is told on its own; the Apply error is the one passed on.
    await board.host.savePlan(kept).catch(failed(board));
    throw error;
  }
}

/** What the toast says of a choice: what it does, and what came or went. */
function chosenMessage(board: Board, id: string, choice: Choice): string {
  const t = board.texts();
  const tile = tileOf(board.state(), id);
  const swapped = tile.stage === "service" && choice.dropped.length > 0;
  const key =
    tile.status === "built-in"
      ? id
      : tile.stage === "effects" && !choice.plan.has(id)
        ? "removed"
        : swapped
          ? "serviceInstead"
          : tile.stage;
  const said = t.t(`chain.chosen.${key}`, {
    name: t.name(id),
    dropped: t.names(choice.dropped),
  });
  if (swapped) return said;
  if (choice.dropped.length)
    return `${said} ${t.t("chain.chosen.dropped", { names: t.names(choice.dropped) })}`;
  if (choice.added.length)
    return `${said} ${t.t("chain.chosen.added", { names: t.names(choice.added) })}`;
  return said;
}

function planActions(
  board: Board,
): Pick<Actions, "choose" | "build" | "undo" | "undoAll"> {
  const t = () => board.texts();
  return {
    choose(id) {
      const state = board.state();
      const choice = choose(state, id);
      if (choice.plan === state.plan) return;
      change(
        board,
        choice.plan,
        chosenMessage(board, id, choice),
        `tile-${id}`,
      );
    },
    build(id) {
      const state = board.state();
      const build = BUILDS.find((b) => b.id === id);
      if (!build) return;
      const choice = withBuild(state, build);
      change(
        board,
        choice.plan,
        t().t("chain.built", { names: t().names(build.modules) }),
        "status",
      );
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
      const state = board.state();
      change(
        board,
        runningPlan(board.host, state.world, state.pieces),
        t().t("status.backToWorld"),
        "status",
      );
    },
  };
}

/** Opening a stage's choices, picking a tile, opening a step, checking. */
function viewActions(
  board: Board,
): Pick<Actions, "openStage" | "select" | "showStep" | "check"> {
  return {
    openStage(stage) {
      const state = board.state();
      if (stage === null || stage === state.open) {
        board.set({ ...state, open: null }, `stage-${state.open ?? "service"}`);
        return;
      }
      const tiles = tilesOf(state, stage);
      const first = tiles.find((tile) => tile.inChain) ?? tiles[0];
      board.set(
        { ...state, open: stage, selected: first?.id ?? null },
        "drawer-title",
      );
    },
    select(id) {
      board.set({ ...board.state(), selected: id }, `tile-${id}`);
    },
    showStep(key) {
      const state = board.state();
      const shown = state.panel === key ? "none" : key;
      board.set(
        { ...state, panel: shown, confirming: null },
        `objective-${key}`,
      );
    },
    check(item) {
      if (item.target) board.host.openCheck(item.target);
      const state = board.state();
      board.set(
        { ...state, checked: new Set([...state.checked, item.id]) },
        "objective-check",
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
  return {
    ...planActions(board),
    ...viewActions(board),
    ...tripActions(board),
    ...carryActions(board),
  };
}
