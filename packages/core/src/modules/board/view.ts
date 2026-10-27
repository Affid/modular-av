import { el } from "@modular-av/kit";
import type { BoardHost } from "../host.ts";
import type { Piece } from "../pieces.ts";
import { isNewer, updatesFor } from "../steps.ts";
import type { BoardState, Confirming } from "./state.ts";
import type { Texts } from "./texts.ts";

/** What a view may ask the board to do; the board re-renders after. */
export interface Actions {
  add(id: string): void;
  remove(id: string): void;
  undo(): void;
  undoAll(): void;
  helper(open: boolean): void;
  answer(id: string): void;
  confirm(which: Confirming): void;
  leave(): void;
  apply(): void;
  copy(text: string): void;
  saveFile(text: string): void;
  chat(text: string): void;
  retry(): void;
  /** A piece picked up (or put down: null); sockets show where it fits. */
  dragging(id: string | null): void;
}

export interface View {
  readonly doc: Document;
  readonly host: BoardHost;
  readonly state: BoardState;
  readonly text: Texts;
  readonly act: Actions;
}

export interface ButtonOptions {
  readonly label: string;
  /** Where focus can be put back after a re-render. */
  readonly key: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly link?: boolean;
  readonly disabled?: boolean;
}

export function button(view: View, options: ButtonOptions): HTMLButtonElement {
  const kind = options.link ? "link" : options.primary ? "primary" : "";
  const b = el("button", {
    doc: view.doc,
    className: `mav-board-button ${kind}`.trim(),
    text: options.label,
    attrs: { type: "button", "data-key": options.key },
  });
  b.disabled = options.disabled ?? false;
  b.addEventListener("click", options.onClick);
  return b;
}

export const coreVersion = (state: BoardState): string =>
  state.world.get("modular-av")?.version ?? "0.0.0";

export const isUpdatable = (state: BoardState, id: string): boolean =>
  updatesFor(state.world, state.loaded.catalog).includes(id);

/** Status and plan badges for a piece, on the board or in the tray. */
export function badges(
  view: View,
  piece: Piece,
  where: "board" | "tray",
): HTMLElement {
  const { state, text } = view;
  const installed = state.world.get(piece.id);
  const list: [string, string][] = [
    installed?.active
      ? ["running", text.t("badge.running")]
      : installed
        ? ["off", text.t("badge.off")]
        : ["missing", text.t("badge.missing")],
  ];
  if (where === "board" && !installed?.active)
    list.push([
      "will-add",
      text.t(installed ? "badge.willTurnOn" : "badge.willInstall"),
    ]);
  if (where === "tray" && installed?.active) list.push(turnOff(view, piece));
  if (isUpdatable(state, piece.id))
    list.push(["update", text.t("badge.update")]);
  if (!state.loaded.known.has(piece.id))
    list.push(["new", text.t("badge.new")]);
  if (piece.needsCore && isNewer(piece.needsCore, coreVersion(state)))
    list.push([
      "needs",
      text.t("badge.needsCore", { version: piece.needsCore }),
    ]);
  return el("span", {
    doc: view.doc,
    className: "mav-board-badges",
    children: list.map(([kind, label]) =>
      el("span", {
        doc: view.doc,
        className: `mav-board-badge ${kind}`,
        text: label,
      }),
    ),
  });
}

/** A running piece left in the tray: it goes, maybe with what it needs. */
function turnOff(view: View, piece: Piece): [string, string] {
  const parent = piece.requires.find(
    (r) => r !== "modular-av" && !view.state.plan.has(r),
  );
  return [
    "will-remove",
    parent
      ? view.text.t("badge.willTurnOffNeeds", { name: view.text.name(parent) })
      : view.text.t("badge.willTurnOff"),
  ];
}
