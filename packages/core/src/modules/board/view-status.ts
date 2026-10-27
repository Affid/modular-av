import { el } from "@modular-av/kit";
import { planDiff, runningOf, updatesFor } from "../steps.ts";
import { button, type View } from "./view.ts";

/** Where the list of modules came from, and a retry when GitHub failed. */
export function sourceLine(view: View): HTMLElement {
  const { source } = view.state.loaded;
  const line = el("p", {
    doc: view.doc,
    className: "mav-board-source",
    attrs: { "data-source": source },
    children: [view.text.t(`source.${source}`)],
  });
  if (source === "offline")
    line.append(
      " ",
      button(view, {
        label: view.text.t("source.retry"),
        key: "retry",
        link: true,
        onClick: () => {
          view.act.retry();
        },
      }),
    );
  return line;
}

/** Newer versions of what is installed: done on Setup, whenever. */
export function updatesNotice(view: View): HTMLElement | null {
  const ids = updatesFor(view.state.world, view.state.loaded.catalog);
  if (!ids.length) return null;
  return el("div", {
    doc: view.doc,
    className: "mav-board-notice",
    attrs: { role: "note" },
    children: [
      el("strong", { doc: view.doc, text: view.text.t("updates.label") }),
      ` ${view.text.names(ids)} `,
      el("span", {
        doc: view.doc,
        className: "hint",
        text: view.text.t("updates.hint"),
      }),
    ],
  });
}

/** What the plan means now, in a sentence. */
function summary(view: View): string {
  const { state, text } = view;
  const { trip } = state;
  if (trip?.length) {
    const got = trip.filter((id) => state.world.has(id));
    const missing = trip.filter((id) => !state.world.has(id));
    return missing.length
      ? text.t("status.back", {
          got: got.length ? text.names(got) : text.t("status.backNothing"),
          missing: text.names(missing),
        })
      : text.t("status.backAll", { names: text.names(got) });
  }
  const diff = planDiff(state.plan, state.world);
  const changes = diff.turnOn.length + diff.turnOff.length;
  if (changes === 0) {
    const running = [...runningOf(state.world)];
    return running.length
      ? text.t("status.runs", { names: text.names(running) })
      : text.t("status.runsNothing");
  }
  const counts: readonly (readonly [string, number])[] = [
    ["status.install", diff.install.length],
    ["status.turnOn", diff.turnOn.length - diff.install.length],
    ["status.turnOff", diff.turnOff.length],
  ];
  const parts = counts
    .filter(([, count]) => count > 0)
    .map(([key, count]) => text.t(key, { count: String(count) }));
  return text.t("status.plan", { changes: parts.join(", ") });
}

/** The plan in a sentence, announced, with undo. */
export function statusBar(view: View): HTMLElement {
  const { state } = view;
  const changed = planDiff(state.plan, state.world);
  const differs = changed.turnOn.length + changed.turnOff.length > 0;
  return el("div", {
    doc: view.doc,
    className: "mav-board-status",
    attrs: { role: "status", tabindex: "-1", "data-key": "status" },
    children: [
      el("span", { doc: view.doc, className: "grow", text: summary(view) }),
      state.history.length
        ? button(view, {
            label: view.text.t("status.undo"),
            key: "undo",
            onClick: () => {
              view.act.undo();
            },
          })
        : null,
      differs
        ? button(view, {
            label: view.text.t("status.undoAll"),
            key: "undo-all",
            onClick: () => {
              view.act.undoAll();
            },
          })
        : null,
    ],
  });
}
