import { el } from "@modular-av/kit";
import { pieceOf } from "../pieces.ts";
import { applicable, planDiff } from "../steps.ts";
import { button, type View } from "./view.ts";
import { setupStep } from "./view-setup.ts";

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
    a.keep.length && next
      ? t(view, "keeps", {
          names: text.names(a.keep),
          name: text.name(next.id),
        })
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

/** Step 2: Apply turns modules on and off, and everyone reloads. */
function worldStep(view: View): HTMLElement {
  const diff = planDiff(view.state.plan, view.state.world);
  const done = diff.turnOn.length + diff.turnOff.length === 0;
  const place = el("section", {
    doc: view.doc,
    className: "mav-board-step",
    attrs: { "data-done": String(done) },
    children: [
      el("h3", { doc: view.doc, text: t(view, "title") }),
      el("p", { doc: view.doc, className: "hint", text: t(view, "who") }),
    ],
  });
  if (done) {
    place.append(el("p", { doc: view.doc, text: t(view, "done") }));
    return place;
  }
  const parts = applyParts(view);
  place.append(
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
  );
  if (view.state.confirming === "apply") place.append(applyConfirm(view));
  return place;
}

/** Step 3: what to set once the pieces run. */
function settingsStep(view: View): HTMLElement | null {
  const { plan, pieces } = view.state;
  const s = (key: string, data?: Readonly<Record<string, string>>) =>
    view.text.t(`steps.settings.${key}`, data);
  const effects = pieces.filter((p) => p.kind === "effect" && plan.has(p.id));
  const themes = pieces.filter((p) => p.kind === "theme" && plan.has(p.id));
  const items = [
    plan.has("modular-av-livekit") ? s("livekit") : null,
    plan.has("modular-av-jitsi") ? s("jitsi") : null,
    ...themes.map((p) => s("theme", { name: view.text.name(p.id) })),
    effects.length
      ? s("effects", { names: view.text.names(effects.map((p) => p.id)) })
      : null,
  ].filter((item): item is string => item !== null);
  if (!items.length) return null;
  return el("section", {
    doc: view.doc,
    className: "mav-board-step",
    children: [
      el("h3", { doc: view.doc, text: s("title") }),
      el("ul", {
        doc: view.doc,
        className: "mav-board-todo",
        children: items.map((item) => el("li", { doc: view.doc, text: item })),
      }),
    ],
  });
}

export function steps(view: View): HTMLElement {
  const hasService = view.state.pieces.some(
    (p) => p.kind === "service" && view.state.plan.has(p.id),
  );
  return el("section", {
    doc: view.doc,
    className: "mav-board-steps",
    attrs: { "aria-label": view.text.t("steps.label") },
    children: [
      el("h2", { doc: view.doc, text: view.text.t("steps.title") }),
      hasService
        ? null
        : el("p", {
            doc: view.doc,
            className: "mav-board-warning",
            text: view.text.t("steps.serviceFirst"),
          }),
      setupStep(view),
      worldStep(view),
      settingsStep(view),
    ],
  });
}
