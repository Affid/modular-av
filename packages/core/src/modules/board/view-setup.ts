import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { linksFor, planDiff, updatesFor } from "../steps.ts";
import type { Texts } from "./texts.ts";
import { button, type View } from "./view.ts";

type Link = ReturnType<typeof linksFor>[number];

/** The links as one block of text: for the clipboard, a file or the chat. */
export function installText(
  text: Texts,
  links: readonly (Link & { readonly url: string })[],
  updates: readonly string[],
): string {
  return [
    text.t("file.title"),
    text.t("file.how"),
    "",
    ...updates.map((id) => text.t("file.update", { name: text.name(id) })),
    ...links.map((l) =>
      l.brings.length
        ? text.t("file.brings", {
            name: text.name(l.id),
            names: text.names(l.brings),
            url: l.url,
          })
        : text.t("file.link", { name: text.name(l.id), url: l.url }),
    ),
    "",
    text.t("file.then"),
  ].join("\n");
}

function linkRow(
  view: View,
  link: Link & { readonly url: string },
): HTMLElement {
  const name = view.text.name(link.id);
  return el("div", {
    doc: view.doc,
    className: "mav-board-link",
    children: [
      el("strong", { doc: view.doc, text: name }),
      link.brings.length
        ? el("span", {
            doc: view.doc,
            className: "hint",
            text: view.text.t("steps.setup.brings", {
              names: view.text.names(link.brings),
            }),
          })
        : null,
      el("code", { doc: view.doc, text: link.url }),
      button(view, {
        label: view.text.t("steps.setup.copyOne", { name }),
        key: `copy-${link.id}`,
        onClick: () => {
          view.act.copy(link.url);
        },
      }),
    ],
  });
}

function leaveConfirm(view: View): HTMLElement {
  const others = view.host.othersOnline();
  return el("div", {
    doc: view.doc,
    className: "mav-board-confirm",
    attrs: {
      role: "group",
      "aria-label": view.text.t("steps.setup.leaveLabel"),
    },
    children: [
      el("strong", {
        doc: view.doc,
        text: others
          ? view.text.t("steps.setup.leavePlayers", { count: String(others) })
          : view.text.t("steps.setup.leaveAlone"),
      }),
      el("span", {
        doc: view.doc,
        text: view.text.t("steps.setup.leaveLinks"),
      }),
      el("div", {
        doc: view.doc,
        className: "mav-board-row",
        children: [
          button(view, {
            label: view.text.t("steps.setup.leaveOk"),
            key: "leave-ok",
            primary: true,
            onClick: () => {
              view.act.leave();
            },
          }),
          button(view, {
            label: view.text.t("steps.setup.notNow"),
            key: "leave-no",
            onClick: () => {
              view.act.confirm(null);
            },
          }),
        ],
      }),
    ],
  });
}

function carry(view: View, text: string): HTMLElement {
  const t = (key: string) => view.text.t(`steps.setup.${key}`);
  return el("div", {
    doc: view.doc,
    className: "mav-board-row",
    children: [
      button(view, {
        label: t("copyAll"),
        key: "copy-all",
        primary: true,
        onClick: () => {
          view.act.copy(text);
        },
      }),
      button(view, {
        label: t("saveFile"),
        key: "save-file",
        onClick: () => {
          view.act.saveFile(text);
        },
      }),
      button(view, {
        label: view.state.chatSent ? t("chatSent") : t("chat"),
        key: "chat",
        disabled: view.state.chatSent,
        onClick: () => {
          view.act.chat(text);
        },
      }),
      button(view, {
        label: t("leave"),
        key: "go-setup",
        onClick: () => {
          view.act.confirm("leave");
        },
      }),
    ],
  });
}

type Located = Link & { readonly url: string };

/** What to do on Setup: update, then install with the links. */
function setupTodo(
  view: View,
  links: readonly Located[],
  updates: readonly string[],
): HTMLElement {
  const { text } = view;
  return el("ol", {
    doc: view.doc,
    className: "mav-board-todo",
    children: [
      updates.length
        ? el("li", {
            doc: view.doc,
            text: text.t("steps.setup.update", { names: text.names(updates) }),
          })
        : null,
      links.length
        ? el("li", {
            doc: view.doc,
            children: [
              text.t("steps.setup.install"),
              ...links.map((l) => linkRow(view, l)),
            ],
          })
        : null,
    ],
  });
}

/** Load in: updates and the fewest links to paste, carried to Setup. */
export function loadBody(view: View): readonly (HTMLElement | null)[] {
  const { state, text } = view;
  const install = state.trip ?? planDiff(state.plan, state.world).install;
  const missing = install.filter((id) => !state.world.has(id));
  const links = linksFor(missing, state.pieces).map((l) => ({
    ...l,
    url: pieceOf(state.pieces, l.id)?.manifest ?? "",
  }));
  const updates = updatesFor(state.world, state.loaded.catalog);
  const who = el("p", {
    doc: view.doc,
    className: "hint",
    text: text.t("steps.setup.who"),
  });
  if (links.length + updates.length === 0)
    return [el("p", { doc: view.doc, text: text.t("steps.setup.done") })];
  return [
    who,
    setupTodo(view, links, updates),
    el("p", {
      doc: view.doc,
      className: "hint",
      text: text.t("steps.setup.carryHint"),
    }),
    carry(view, installText(text, links, updates)),
    state.confirming === "leave" ? leaveConfirm(view) : null,
  ];
}
