import { el } from "@modular-av/kit";
import type { BoardHost } from "../host.ts";
import { updatesFor } from "../steps.ts";
import type { Build } from "./builds.ts";
import type { Stage } from "./chain.ts";
import type { Check, ObjectiveKey } from "./objectives.ts";
import type { BoardState, Confirming } from "./state.ts";
import type { Texts } from "./texts.ts";

/** What a view may ask the board to do; the board re-renders after. */
export interface Actions {
  /** Chooses a tile in its stage (a toggle for an effect). */
  choose(id: string): void;
  build(id: Build["id"]): void;
  /** Opens a stage's choices; null (or the open one) closes them. */
  openStage(stage: Stage | null): void;
  select(id: string): void;
  showStep(key: ObjectiveKey): void;
  check(item: Check): void;
  undo(): void;
  undoAll(): void;
  confirm(which: Confirming): void;
  leave(): void;
  apply(): void;
  copy(text: string): void;
  saveFile(text: string): void;
  chat(text: string): void;
  retry(): void;
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
