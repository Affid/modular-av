import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { type Build, buildsFor, type Pips } from "./builds.ts";
import { stageOf } from "./chain.ts";
import { button, type View } from "./view.ts";
import { emblem, iconOf } from "./view-card.ts";

const PIPS: readonly Pips[] = [1, 2, 3];

function meter(
  view: View,
  build: Build,
  key: "tableSize" | "setup",
): HTMLElement {
  const t = (k: string) => view.text.t(`chain.builds.${k}`);
  return el("div", {
    doc: view.doc,
    className: "mav-board-meter",
    children: [
      el("span", { doc: view.doc, className: "k", text: t(key) }),
      el("span", {
        doc: view.doc,
        className: "pips",
        attrs: { "aria-hidden": "true" },
        children: PIPS.map((n) =>
          el("i", { doc: view.doc, className: n <= build[key] ? "on" : "" }),
        ),
      }),
      el("span", { doc: view.doc, text: t(`${build.id}.${key}`) }),
    ],
  });
}

/** "Fills the chain with": each module, and whether it is installed. */
function includes(view: View, build: Build): HTMLElement {
  const { state, text } = view;
  return el("div", {
    doc: view.doc,
    className: "mav-board-includes",
    children: [
      el("span", {
        doc: view.doc,
        className: "k",
        text: text.t("chain.builds.fills"),
      }),
      ...build.modules.map((id) => {
        const kind = pieceOf(state.pieces, id)?.kind ?? "effect";
        const installed = state.world.get(id);
        const said = installed?.active
          ? "running"
          : installed
            ? "off"
            : "missing";
        return el("div", {
          doc: view.doc,
          className: "inc",
          attrs: { "data-stage": stageOf(kind) },
          children: [
            el("i", {
              doc: view.doc,
              className: iconOf(view, id, stageOf(kind)),
              attrs: { "aria-hidden": "true" },
            }),
            el("span", { doc: view.doc, text: text.name(id) }),
            el("span", {
              doc: view.doc,
              className: "st",
              attrs: { "data-status": said },
              text: text.t(`chain.status.${said}`),
            }),
          ],
        });
      }),
    ],
  });
}

function card(view: View, build: Build): HTMLElement {
  const t = (k: string) => view.text.t(`chain.builds.${build.id}.${k}`);
  const titleId = `mav-board-build-${build.id}`;
  return el("article", {
    doc: view.doc,
    className: "mav-board-build",
    attrs: { "aria-labelledby": titleId },
    children: [
      el("div", {
        doc: view.doc,
        className: "top",
        children: [
          emblem(view, build.service, "service", "large"),
          build.tag
            ? el("span", {
                doc: view.doc,
                className: `mav-board-tag ${build.tag}`,
                text: view.text.t(`chain.builds.tag.${build.tag}`),
              })
            : null,
        ],
      }),
      el("h3", { doc: view.doc, attrs: { id: titleId }, text: t("title") }),
      el("p", { doc: view.doc, className: "hint", text: t("sub") }),
      el("p", { doc: view.doc, text: t("line") }),
      meter(view, build, "tableSize"),
      meter(view, build, "setup"),
      includes(view, build),
      button(view, {
        label: view.text.t("chain.builds.use"),
        key: `build-${build.id}`,
        primary: true,
        onClick: () => {
          view.act.build(build.id);
        },
      }),
    ],
  });
}

/** Under an empty chain: common setups that fill it in one click. */
export function builds(view: View): HTMLElement | null {
  const offered = buildsFor(view.state.pieces);
  if (!offered.length) return null;
  return el("section", {
    doc: view.doc,
    className: "mav-board-builds",
    attrs: { "aria-labelledby": "mav-board-builds-title" },
    children: [
      el("h3", {
        doc: view.doc,
        attrs: { id: "mav-board-builds-title" },
        text: view.text.t("chain.builds.title"),
      }),
      el("p", {
        doc: view.doc,
        className: "hint",
        text: view.text.t("chain.builds.lead"),
      }),
      el("div", {
        doc: view.doc,
        className: "cards",
        children: offered.map((b) => card(view, b)),
      }),
    ],
  });
}
