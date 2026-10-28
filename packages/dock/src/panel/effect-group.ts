import type { ControlContribution, EffectDefinition } from "@modular-av/api";
import { el, uniqueId } from "@modular-av/kit";
import {
  byOrder,
  type Rendered,
  renderControl,
} from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { costText, type Effects, stateText } from "./effect-text.ts";
import type { EffectModel } from "./effects.ts";

/** Up to this many effects show as buttons beside "Off"; more as a list. */
const AS_BUTTONS = 2;

export interface GroupRow {
  readonly element: HTMLElement;
  render(effects: Effects): void;
  dispose(): void;
}

interface GroupSpec {
  readonly name: string;
  readonly group: readonly EffectDefinition[];
  readonly model: EffectModel;
  readonly alerts: HTMLElement | null;
}

function groupLabel(ctx: DockContext, spec: GroupSpec): string {
  const [only] = spec.group;
  if (spec.group.length === 1 && only) return ctx.text(only.label);
  const key = `effects.group-${spec.name}`;
  const text = ctx.t(key);
  return text.endsWith(key) ? spec.name : text;
}

/** Off and each effect, as a list or as buttons; `set` shows a choice. */
function chooser(
  ctx: DockContext,
  doc: Document,
  spec: GroupSpec,
  id: string,
): { element: HTMLElement; set(chosen: string, effects: Effects): void } {
  const choices = [
    { value: "", label: ctx.t("effects.none") },
    ...spec.group.map((d) => ({
      value: d.id,
      label:
        spec.group.length > AS_BUTTONS
          ? `${ctx.text(d.label)} · ${costText(ctx, d)}`
          : ctx.text(d.label),
    })),
  ];
  const pick = (value: string): void => {
    spec.model.choose(spec.group, value);
  };
  if (spec.group.length > AS_BUTTONS) {
    const select = el("select", {
      doc,
      attrs: { id, "data-effect-group": spec.name },
      children: choices.map((c) =>
        el("option", { doc, text: c.label, attrs: { value: c.value } }),
      ),
    });
    select.addEventListener("change", () => {
      pick(select.value);
    });
    return {
      element: select,
      set(chosen, effects) {
        select.value = chosen;
        for (const option of select.options) {
          const status = effects[option.value]?.status;
          option.disabled = status === "unsupported";
          // Not offered by the call's service (e.g. Krisp off LiveKit Cloud).
          option.hidden = status === "unavailable";
        }
      },
    };
  }
  const buttons = choices.map((c) => {
    const button = el("button", {
      doc,
      className: "mav-effect-choice",
      text: c.label,
      attrs: {
        type: "button",
        "data-effect": c.value,
        "aria-pressed": "false",
      },
    });
    button.addEventListener("click", () => {
      pick(c.value);
    });
    return button;
  });
  return {
    element: el("div", {
      doc,
      className: "mav-effect-choices",
      attrs: { id, role: "group", "data-effect-group": spec.name },
      children: buttons,
    }),
    set(chosen, effects) {
      for (const button of buttons) {
        const value = button.dataset.effect ?? "";
        const status = effects[value]?.status;
        button.setAttribute("aria-pressed", String(value === chosen));
        button.disabled = status === "unsupported";
        button.hidden = status === "unavailable";
      }
    },
  };
}

/** The controls other modules attached to `effect`, in order. */
function attachedTo(ctx: DockContext, effect: string): ControlContribution[] {
  return ctx.api.contributions
    .list()
    .filter(
      (c): c is ControlContribution =>
        c.kind === "control" && c.effect === effect,
    )
    .sort(byOrder);
}

/**
 * One effect group: its choice, a word while it starts or fails, the
 * crackling hint for a heavier audio one, and the chosen effect's own
 * controls under it.
 */
export function effectGroup(
  ctx: DockContext,
  doc: Document,
  spec: GroupSpec,
): GroupRow {
  const id = uniqueId(doc, "mav-effect");
  const choice = chooser(ctx, doc, spec, id);
  const state = el("span", { doc, className: "mav-effect-state" });
  const hint = el("p", {
    doc,
    className: "mav-settings-hint",
    text: ctx.t("effects.heavyHint"),
  });
  const attached = el("div", { doc, className: "mav-effect-controls" });
  let shown: { effect: string; parts: readonly Rendered[] } | null = null;
  const showControls = (effect: string): void => {
    if (shown?.effect === effect) return;
    for (const part of shown?.parts ?? []) part.dispose();
    const parts = effect
      ? attachedTo(ctx, effect).map((c) =>
          renderControl(ctx, doc, c, spec.alerts),
        )
      : [];
    attached.replaceChildren(...parts.map((p) => p.element));
    attached.hidden = parts.length === 0;
    shown = { effect, parts };
  };
  const label = el("label", { doc, text: groupLabel(ctx, spec) });
  if (spec.group.length > AS_BUTTONS) label.htmlFor = id;
  else label.id = `${id}-label`;
  if (spec.group.length <= AS_BUTTONS)
    choice.element.setAttribute("aria-labelledby", label.id);
  const element = el("div", {
    doc,
    className: "mav-control mav-effect",
    attrs: { "data-control": "choice" },
    children: [label, choice.element, state, hint, attached],
  });
  return {
    element,
    render(effects) {
      const chosen = spec.model.chosen(spec.group);
      choice.set(chosen, effects);
      const definition = spec.group.find((d) => d.id === chosen);
      state.textContent = definition ? stateText(ctx, definition, effects) : "";
      state.hidden = state.textContent === "";
      // About sound breaking up: a heavier audio effect chosen (and not
      // failed), so the window warns before it is saved.
      hint.hidden =
        definition?.kind !== "audio" ||
        definition.cost === "light" ||
        effects[definition.id]?.status === "failed";
      element.hidden = spec.group.every(
        (d) => effects[d.id]?.status === "unavailable",
      );
      showControls(chosen);
    },
    dispose() {
      for (const part of shown?.parts ?? []) part.dispose();
    },
  };
}
