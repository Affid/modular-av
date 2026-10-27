import { el, uniqueId } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { button, type View } from "./view.ts";

/** "Where should calls go?": an answer each, and the service it means. */
export const ANSWERS = [
  { answer: "browsers", id: "modular-av-p2p" },
  { answer: "livekit", id: "modular-av-livekit" },
  { answer: "jitsi", id: "modular-av-jitsi" },
] as const;

function choice(view: View, answer: string, id: string): HTMLElement {
  const input = el("input", {
    doc: view.doc,
    attrs: {
      type: "radio",
      name: "mav-board-where",
      id: uniqueId(view.doc, "mav-board-where"),
      value: id,
      "data-key": `helper-${answer}`,
    },
  });
  input.checked = view.state.answer === id;
  input.addEventListener("change", () => {
    view.act.answer(id);
  });
  return el("label", {
    doc: view.doc,
    className: "mav-board-choice",
    attrs: { for: input.id },
    children: [input, view.text.t(`helper.${answer}`)],
  });
}

function pick(view: View, answer: string, id: string): readonly Node[] {
  const { state, text } = view;
  const current = state.pieces.find(
    (p) => p.kind === "service" && state.plan.has(p.id) && p.id !== id,
  );
  const name = text.name(id);
  const already = state.plan.has(id);
  const label = already
    ? text.t("helper.already", { name })
    : current
      ? text.t("helper.useInstead", { name, current: text.name(current.id) })
      : text.t("helper.use", { name });
  return [
    el("p", {
      doc: view.doc,
      className: "hint",
      text: text.t(`helper.${answer}Why`),
    }),
    button(view, {
      label,
      key: "helper-go",
      primary: true,
      disabled: already,
      onClick: () => {
        view.act.add(id);
      },
    }),
  ];
}

/** Beside the Service heading: which service suits this table. */
export function helper(view: View): HTMLElement {
  const offered = ANSWERS.filter((a) => pieceOf(view.state.pieces, a.id));
  const chosen = offered.find((a) => a.id === view.state.answer);
  return el("div", {
    doc: view.doc,
    className: "mav-board-helper",
    attrs: { role: "group", "aria-label": view.text.t("helper.label") },
    children: [
      el("fieldset", {
        doc: view.doc,
        children: [
          el("legend", { doc: view.doc, text: view.text.t("helper.question") }),
          ...offered.map((a) => choice(view, a.answer, a.id)),
        ],
      }),
      ...(chosen ? pick(view, chosen.answer, chosen.id) : []),
      button(view, {
        label: view.text.t("helper.close"),
        key: "helper-close",
        link: true,
        onClick: () => {
          view.act.helper(false);
        },
      }),
    ],
  });
}
