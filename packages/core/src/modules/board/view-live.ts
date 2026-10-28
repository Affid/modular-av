import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { applicable, planDiff } from "../steps.ts";
import { button, type View } from "./view.ts";

const t = (view: View, key: string, data?: Readonly<Record<string, string>>) =>
  view.text.t(`steps.world.${key}`, data);

/** "turn on A and turn off B", or "" when Apply has nothing to do. */
export function applyParts(view: View): string {
  const { on, off } = applicable(
    view.state.plan,
    view.state.world,
    view.state.pieces,
  );
  return [
    on.length ? t(view, "turnOn", { names: view.text.names(on) }) : "",
    off.length ? t(view, "turnOff", { names: view.text.names(off) }) : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function todo(view: View): HTMLElement {
  const { state, text } = view;
  const a = applicable(state.plan, state.world, state.pieces);
  const parts = applyParts(view);
  const service = a.on.find(
    (id) => pieceOf(state.pieces, id)?.kind === "service",
  );
  const next = state.pieces.find(
    (p) => p.kind === "service" && state.plan.has(p.id),
  );
  const notInstalled = a.waiting.filter((id) => !state.world.has(id));
  const needing = a.waiting.filter((id) => state.world.has(id));
  const items = [
    parts
      ? service
        ? t(view, "carries", { parts, name: text.name(service) })
        : t(view, "apply", { parts })
      : null,
    a.keep.length
      ? next
        ? t(view, "keeps", {
            names: text.names(a.keep),
            name: text.name(next.id),
          })
        : t(view, "keepsNone", { names: text.names(a.keep) })
      : null,
    notInstalled.length
      ? t(view, "waiting", { names: text.names(notInstalled) })
      : null,
    needing.length
      ? t(view, "waitingNeeds", { names: text.names(needing) })
      : null,
  ];
  return el("ol", {
    doc: view.doc,
    className: "mav-board-todo",
    children: items.map((item) =>
      item ? el("li", { doc: view.doc, text: item }) : null,
    ),
  });
}

function applyConfirm(view: View): HTMLElement {
  const others = view.host.othersOnline();
  return el("div", {
    doc: view.doc,
    className: "mav-board-confirm",
    attrs: { role: "group", "aria-label": t(view, "confirmLabel") },
    children: [
      el("strong", {
        doc: view.doc,
        text: others
          ? t(view, "reloadPlayers", { count: String(others) })
          : t(view, "reloadAlone"),
      }),
      el("div", {
        doc: view.doc,
        className: "mav-board-row",
        children: [
          button(view, {
            label: t(view, "ok"),
            key: "apply-ok",
            primary: true,
            onClick: () => {
              view.act.apply();
            },
          }),
          button(view, {
            label: t(view, "later"),
            key: "apply-no",
            onClick: () => {
              view.act.confirm(null);
            },
          }),
        ],
      }),
    ],
  });
}

/** Go live: Apply turns modules on and off, and everyone reloads. */
export function liveBody(view: View): readonly (HTMLElement | null)[] {
  const who = el("p", {
    doc: view.doc,
    className: "hint",
    text: t(view, "who"),
  });
  const diff = planDiff(view.state.plan, view.state.world);
  if (diff.turnOn.length + diff.turnOff.length === 0)
    return [el("p", { doc: view.doc, text: t(view, "done") })];
  const parts = applyParts(view);
  return [
    who,
    todo(view),
    button(view, {
      label: parts ? t(view, "button", { parts }) : t(view, "nothing"),
      key: "apply",
      primary: true,
      disabled: !parts,
      onClick: () => {
        view.act.confirm("apply");
      },
    }),
    view.state.confirming === "apply" ? applyConfirm(view) : null,
  ];
}
