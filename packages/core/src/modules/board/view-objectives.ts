import { el } from "@modular-av/kit";
import {
  type Check,
  checksOf,
  currentOf,
  type Objective,
  type ObjectiveKey,
  objectivesOf,
} from "./objectives.ts";
import { button, type View } from "./view.ts";
import { liveBody } from "./view-live.ts";
import { loadBody } from "./view-setup.ts";

/** Where each step happens: Setup is outside the world. */
const AWAY: ReadonlySet<ObjectiveKey> = new Set(["load"]);

function checkName(view: View, check: Check): string {
  const { text } = view;
  if (check.kind === "section")
    return text.t("chain.check.section", { name: check.label });
  return text.t(`chain.check.${check.kind}`, {
    name: text.name(check.modules[0] ?? ""),
    names: text.names(check.modules),
  });
}

function checkRow(view: View, check: Check): HTMLElement {
  const done = check.target === null || view.state.checked.has(check.id);
  const action = check.locked
    ? el("span", {
        doc: view.doc,
        className: "mav-board-where",
        text: view.text.t("chain.check.locked"),
      })
    : check.target && !view.state.checked.has(check.id)
      ? button(view, {
          label: view.text.t("chain.check.open"),
          key: `check-${check.id}`,
          onClick: () => {
            view.act.check(check);
          },
        })
      : null;
  return el("li", {
    doc: view.doc,
    className: "mav-board-check",
    attrs: {
      "data-done": String(done && !check.locked),
      ...(check.locked ? { "data-locked": "" } : {}),
    },
    children: [
      el("span", {
        doc: view.doc,
        className: "text",
        text: checkName(view, check),
      }),
      action,
    ],
  });
}

function checkBody(view: View, checks: readonly Check[], later: boolean) {
  const intro = el("p", {
    doc: view.doc,
    className: "hint",
    text: view.text.t(later ? "chain.check.later" : "chain.check.now"),
  });
  if (!checks.length)
    return [
      intro,
      el("p", { doc: view.doc, text: view.text.t("chain.check.none") }),
    ];
  return [
    intro,
    el("ul", {
      doc: view.doc,
      className: "mav-board-checks",
      children: checks.map((c) => checkRow(view, c)),
    }),
  ];
}

function progress(view: View, objective: Objective): HTMLElement | null {
  if (!objective.progress) return null;
  const [got, total] = objective.progress;
  return el("span", {
    doc: view.doc,
    className: "mav-board-pips",
    attrs: {
      role: "img",
      "aria-label": view.text.t("chain.installed", {
        got: String(got),
        total: String(total),
      }),
    },
    children: Array.from({ length: total }, (_, i) =>
      el("i", { doc: view.doc, className: i < got ? "on" : "" }),
    ),
  });
}

/** The step's name, what it is for, and how far it got. */
function headTitle(view: View, objective: Objective): HTMLElement {
  const t = (key: string) => view.text.t(`chain.step.${objective.key}.${key}`);
  return el("span", {
    doc: view.doc,
    className: "title",
    children: [
      el("span", { doc: view.doc, className: "name", text: t("name") }),
      el("span", { doc: view.doc, className: "sub", text: t("sub") }),
      el("span", {
        doc: view.doc,
        className: "state",
        children: [
          progress(view, objective),
          view.text.t(`chain.state.${objective.state}`),
        ],
      }),
    ],
  });
}

function head(
  view: View,
  objective: Objective,
  expanded: boolean,
  index: number,
): HTMLButtonElement {
  const away = AWAY.has(objective.key);
  const b = el("button", {
    doc: view.doc,
    className: "mav-board-objective-head",
    attrs: {
      type: "button",
      "data-key": `objective-${objective.key}`,
      "aria-expanded": String(expanded),
    },
    children: [
      el("span", {
        doc: view.doc,
        className: "mark",
        attrs: { "aria-hidden": "true" },
        text: objective.state === "done" ? "" : String(index + 1),
      }),
      headTitle(view, objective),
      el("span", {
        doc: view.doc,
        className: `mav-board-where ${away ? "away" : ""}`.trim(),
        text: view.text.t(away ? "chain.whereSetup" : "chain.whereWorld"),
      }),
    ],
  });
  b.addEventListener("click", () => {
    view.act.showStep(objective.key);
  });
  return b;
}

/** Load in, Go live, Soundcheck: where each happens, the current one open. */
function objectiveBody(
  view: View,
  objective: Objective,
  checks: readonly Check[],
): HTMLElement {
  const children =
    objective.key === "load"
      ? loadBody(view)
      : objective.key === "live"
        ? liveBody(view)
        : checkBody(view, checks, objective.state === "later");
  return el("div", { doc: view.doc, className: "body", children });
}

export function objectives(view: View): HTMLElement {
  const { state, host } = view;
  const checks = checksOf(
    state,
    host.settingsSections(),
    host.configuredModules(),
  );
  const list = objectivesOf(state, checks);
  const current = currentOf(list, state);
  const shown = state.panel === "none" ? null : (state.panel ?? current);
  const item = (o: Objective, index: number): HTMLElement =>
    el("li", {
      doc: view.doc,
      className: "mav-board-objective",
      attrs: {
        "data-state": o.state,
        ...(o.key === current ? { "data-current": "" } : {}),
      },
      children: [
        head(view, o, o.key === shown, index),
        o.key === shown ? objectiveBody(view, o, checks) : null,
      ],
    });
  return el("section", {
    doc: view.doc,
    className: "mav-board-objectives",
    attrs: { "aria-labelledby": "mav-board-steps-title" },
    children: [
      el("h2", {
        doc: view.doc,
        attrs: { id: "mav-board-steps-title" },
        text: view.text.t("chain.steps"),
      }),
      el("ol", {
        doc: view.doc,
        className: "mav-board-objective-list",
        children: list.map(item),
      }),
    ],
  });
}
