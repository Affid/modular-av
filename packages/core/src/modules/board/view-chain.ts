import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { applicable } from "../steps.ts";
import { chainOf, type Stage, tileOf } from "./chain.ts";
import { button, type View } from "./view.ts";
import { builds } from "./view-builds.ts";
import { emblem, noteOf, ribbons, statusChip } from "./view-card.ts";
import { drawer, DRAWER_ID } from "./view-drawer.ts";

/** A module on its stage: emblem, name, state, what going live does. */
function slot(view: View, id: string): HTMLElement {
  const tile = tileOf(view.state, id);
  const note = noteOf(view, tile);
  return el("span", {
    doc: view.doc,
    className: "mav-board-slot",
    attrs: { "data-stage": tile.stage, "data-status": tile.status },
    children: [
      emblem(view, id, tile.stage),
      el("span", {
        doc: view.doc,
        className: "text",
        children: [
          el("span", {
            doc: view.doc,
            className: "name",
            text: view.text.name(id),
          }),
          statusChip(view, tile),
          note
            ? el("span", {
                doc: view.doc,
                className: "note",
                attrs: { "data-note": tile.note ?? "" },
                text: note,
              })
            : null,
        ],
      }),
      ribbons(view, tile),
    ],
  });
}

/** An empty place on a stage: none chosen, required, or not possible yet. */
function empty(
  view: View,
  key: string,
  kind: "none" | "required" | "locked",
): HTMLElement {
  return el("span", {
    doc: view.doc,
    className: `mav-board-slot empty ${kind}`,
    children: [
      el("i", {
        doc: view.doc,
        className: kind === "locked" ? "fa-solid fa-lock" : "fa-solid fa-plus",
        attrs: { "aria-hidden": "true" },
      }),
      el("span", { doc: view.doc, text: view.text.t(`chain.empty.${key}`) }),
    ],
  });
}

/** The button that opens a stage's choices, holding its cards. */
function patch(
  view: View,
  stage: Stage,
  cards: readonly HTMLElement[],
  foot: string,
): HTMLButtonElement {
  const open = view.state.open === stage;
  const b = el("button", {
    doc: view.doc,
    className: `mav-board-patch ${stage === "look" ? "sub" : ""}`.trim(),
    attrs: {
      type: "button",
      "data-key": `stage-${stage}`,
      "aria-expanded": String(open),
      ...(open ? { "aria-controls": DRAWER_ID } : {}),
    },
    children: [
      ...(stage === "look"
        ? [
            el("span", {
              doc: view.doc,
              className: "sub-label",
              text: view.text.t("chain.stage.look.label"),
            }),
          ]
        : []),
      ...cards,
      el("span", {
        doc: view.doc,
        className: "foot",
        text: open ? view.text.t("chain.close") : foot,
      }),
    ],
  });
  b.addEventListener("click", () => {
    view.act.openStage(stage);
  });
  return b;
}

function stageBox(
  view: View,
  stage: Stage,
  ...patches: HTMLElement[]
): HTMLElement {
  const t = (key: string) => view.text.t(`chain.stage.${stage}.${key}`);
  return el("div", {
    doc: view.doc,
    className: "mav-board-stage",
    attrs: { role: "group", "aria-label": t("label"), "data-stage": stage },
    children: [
      el("div", {
        doc: view.doc,
        className: "head",
        children: [
          el("span", { doc: view.doc, className: "label", text: t("label") }),
          el("span", { doc: view.doc, className: "need", text: t("need") }),
        ],
      }),
      el("p", { doc: view.doc, className: "plain", text: t("plain") }),
      ...patches,
    ],
  });
}

function stages(view: View): readonly HTMLElement[] {
  const chain = chainOf(view.state);
  const foot = (key: string) => view.text.t(`chain.foot.${key}`);
  const cards = (ids: readonly string[]) => ids.map((id) => slot(view, id));
  const look = chain.look.length
    ? cards(chain.look)
    : [empty(view, "look", "locked")];
  return [
    stageBox(
      view,
      "effects",
      patch(
        view,
        "effects",
        chain.effects.length
          ? cards(chain.effects)
          : [empty(view, "effects", "none")],
        foot(chain.effects.length ? "effects" : "addEffect"),
      ),
    ),
    stageBox(
      view,
      "service",
      patch(
        view,
        "service",
        chain.service.length
          ? cards(chain.service)
          : [empty(view, "service", "required")],
        foot(chain.service.length ? "swap" : "chooseService"),
      ),
    ),
    stageBox(
      view,
      "cameras",
      patch(view, "cameras", cards(chain.cameras), foot("change")),
      patch(
        view,
        "look",
        look,
        foot(chain.look.length ? "changeLook" : "seeThemes"),
      ),
    ),
  ];
}

function jack(view: View, end: "in" | "out"): HTMLElement {
  return el("div", {
    doc: view.doc,
    className: "mav-board-jack",
    attrs: { "aria-hidden": "true" },
    children: [
      el("span", { doc: view.doc, className: "socket" }),
      el("b", { doc: view.doc, text: view.text.t(`chain.jack.${end}`) }),
      el("span", { doc: view.doc, text: view.text.t(`chain.jack.${end}What`) }),
    ],
  });
}

/** The chain in signal order: players' microphones to everyone's screen. */
function chainRow(view: View): HTMLElement {
  const { state } = view;
  const service = [...state.plan].find(
    (id) => pieceOf(state.pieces, id)?.kind === "service",
  );
  const flowing = service !== undefined && state.world.has(service);
  const cable = () =>
    el("div", {
      doc: view.doc,
      className: `mav-board-cable ${flowing ? "flow" : ""}`.trim(),
      attrs: { "aria-hidden": "true" },
    });
  const [effects, svc, cameras] = stages(view);
  return el("div", {
    doc: view.doc,
    className: "mav-board-chain",
    children: [
      jack(view, "in"),
      cable(),
      effects ?? null,
      cable(),
      svc ?? null,
      cable(),
      cameras ?? null,
      cable(),
      jack(view, "out"),
    ],
  });
}

/** What leaves the air when going live, and what stays to keep calls going. */
function leaving(view: View): readonly (HTMLElement | null)[] {
  const { state, text } = view;
  const a = applicable(state.plan, state.world, state.pieces);
  const next = state.pieces.find(
    (p) => p.kind === "service" && state.plan.has(p.id),
  );
  return [
    a.off.length
      ? el("p", {
          doc: view.doc,
          className: "mav-board-leaving",
          text: text.t("chain.leaving", { names: text.names(a.off) }),
        })
      : null,
    a.keep.length && next
      ? el("p", {
          doc: view.doc,
          className: "mav-board-leaving",
          text: text.t("chain.kept", {
            names: text.names(a.keep),
            name: text.name(next.id),
          }),
        })
      : null,
  ];
}

function undoRow(view: View): HTMLElement | null {
  if (!view.state.history.length) return null;
  return el("div", {
    doc: view.doc,
    className: "mav-board-row",
    children: [
      button(view, {
        label: view.text.t("status.undo"),
        key: "undo",
        link: true,
        onClick: () => {
          view.act.undo();
        },
      }),
      button(view, {
        label: view.text.t("status.undoAll"),
        key: "undo-all",
        link: true,
        onClick: () => {
          view.act.undoAll();
        },
      }),
    ],
  });
}

/** Next: the chain the GM builds; the world keeps what is on air until Go live. */
export function next(view: View): HTMLElement {
  const { state, text } = view;
  const service = state.pieces.some(
    (p) => p.kind === "service" && state.plan.has(p.id),
  );
  return el("section", {
    doc: view.doc,
    className: "mav-board-next",
    attrs: { "aria-labelledby": "mav-board-next-title" },
    children: [
      el("div", {
        doc: view.doc,
        className: "head",
        children: [
          el("span", {
            doc: view.doc,
            className: "mav-board-sign next",
            text: text.t("chain.next"),
          }),
          el("h2", {
            doc: view.doc,
            attrs: { id: "mav-board-next-title" },
            text: text.t("chain.nextTitle"),
          }),
          el("p", {
            doc: view.doc,
            className: "hint",
            text: text.t("chain.nextHint"),
          }),
        ],
      }),
      chainRow(view),
      drawer(view),
      service ? null : builds(view),
      ...leaving(view),
      undoRow(view),
    ],
  });
}
