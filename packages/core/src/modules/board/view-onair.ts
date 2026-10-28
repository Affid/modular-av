import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { runningOf } from "../steps.ts";
import { type Stage, STAGES, stageOf } from "./chain.ts";
import type { View } from "./view.ts";
import { iconOf } from "./view-card.ts";

/** A small chip: the module's icon and name. */
function chip(view: View, id: string, stage: Stage): HTMLElement {
  return el("span", {
    doc: view.doc,
    className: "mav-board-chip",
    attrs: { "data-stage": stage },
    children: [
      el("i", {
        doc: view.doc,
        className: iconOf(view, id, stage),
        attrs: { "aria-hidden": "true" },
      }),
      el("span", { doc: view.doc, text: view.text.name(id) }),
    ],
  });
}

/** What runs, in signal order, a chevron between stages. */
function runningChain(view: View, ids: readonly string[]): HTMLElement {
  const stageIds = (stage: Stage) =>
    ids.filter((id) => {
      const piece = pieceOf(view.state.pieces, id);
      return piece !== undefined && stageOf(piece.kind) === stage;
    });
  const groups = STAGES.map((stage) => ({ stage, ids: stageIds(stage) }));
  const shown = groups.filter((g) => g.ids.length > 0);
  return el("div", {
    doc: view.doc,
    className: "mav-board-minichain",
    children: shown.flatMap((group, index) => [
      index > 0
        ? el("i", {
            doc: view.doc,
            className: "fa-solid fa-chevron-right arrow",
            attrs: { "aria-hidden": "true" },
          })
        : null,
      ...group.ids.map((id) => chip(view, id, group.stage)),
    ]),
  });
}

/** On air: what this world runs now, as a short chain of chips. */
export function onAir(view: View): HTMLElement {
  const { state, text } = view;
  const running = [...runningOf(state.world)].filter(
    (id) => pieceOf(state.pieces, id) !== undefined,
  );
  const service = running.some(
    (id) => pieceOf(state.pieces, id)?.kind === "service",
  );
  return el("section", {
    doc: view.doc,
    className: "mav-board-onair",
    attrs: { "aria-label": text.t("chain.onAirLabel") },
    children: [
      el("span", {
        doc: view.doc,
        className: `mav-board-sign ${service ? "on" : "off"}`,
        text: text.t(service ? "chain.onAir" : "chain.offAir"),
      }),
      service
        ? runningChain(view, running)
        : el("p", { doc: view.doc, text: text.t("chain.nothingOnAir") }),
    ],
  });
}
