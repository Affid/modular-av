import type {
  EffectDefinition,
  EffectState,
  LocalState,
} from "@modular-av/api";
import { el, uniqueId } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";

type Effects = LocalState["effects"];

const OFF: EffectState = { status: "off", error: null };

/**
 * What the player chose in a group: the one starting, else the one
 * running, else one that failed (kept chosen, so its failure shows).
 */
export function chosenInGroup(
  group: readonly EffectDefinition[],
  effects: Effects,
): string {
  const of = (status: EffectState["status"]) =>
    group.find((d) => effects[d.id]?.status === status)?.id;
  return of("starting") ?? of("running") ?? of("failed") ?? "";
}

const costText = (ctx: DockContext, d: EffectDefinition): string =>
  ctx.t(`effects.cost-${d.cost}`);

/** Why an effect failed, in words, if the dock has words for its error. */
function reasonText(ctx: DockContext, error: string | null): string | null {
  if (!error) return null;
  const key = `effects.errors.${error}`;
  const text = ctx.t(key);
  return text.endsWith(key) ? null : text;
}

/** "On", "Starting…", "Failed: …"… and the cost, for one effect. */
function stateText(
  ctx: DockContext,
  d: EffectDefinition,
  effects: Effects,
): string {
  const status = effects[d.id] ?? OFF;
  const reason =
    status.status === "failed" ? reasonText(ctx, status.error) : null;
  const state = reason
    ? ctx.t("effects.failedBecause", { reason })
    : ctx.t(`effects.${status.status === "off" ? "none" : status.status}`);
  return `${state} · ${costText(ctx, d)}`;
}

const isOn = (status: EffectState | undefined): boolean =>
  status?.status === "starting" || status?.status === "running";

function groupLabel(ctx: DockContext, group: string): string {
  const key = `effects.group-${group}`;
  const text = ctx.t(key);
  return text.endsWith(key) ? group : text;
}

interface Row {
  readonly element: HTMLElement;
  render(effects: Effects): void;
}

function groupRow(
  ctx: DockContext,
  doc: Document,
  name: string,
  group: readonly EffectDefinition[],
  alerts: HTMLElement | null,
): Row {
  const id = uniqueId(doc, "mav-effect");
  const select = el("select", {
    doc,
    attrs: { id, "data-effect-group": name },
    children: [
      el("option", { doc, text: ctx.t("effects.none"), attrs: { value: "" } }),
      ...group.map((d) =>
        el("option", {
          doc,
          text: `${ctx.text(d.label)} · ${costText(ctx, d)}`,
          attrs: { value: d.id },
        }),
      ),
    ],
  });
  const state = el("span", { doc, className: "mav-effect-state" });
  const hint = el("p", {
    doc,
    className: "mav-settings-hint",
    text: ctx.t("effects.heavyHint"),
  });
  select.addEventListener("change", () => {
    const value = select.value;
    const effects = ctx.api.state.get().local.effects;
    const current = chosenInGroup(group, effects);
    run(ctx, alerts, () =>
      value
        ? ctx.api.commands.setEffectEnabled(value, true)
        : ctx.api.commands.setEffectEnabled(current, false),
    );
  });
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "choice" },
    children: [
      el("label", { doc, text: groupLabel(ctx, name), attrs: { for: id } }),
      select,
      state,
      hint,
    ],
  });
  return {
    element,
    render(effects) {
      const chosen = chosenInGroup(group, effects);
      select.value = chosen;
      const definition = group.find((d) => d.id === chosen);
      state.textContent = definition ? stateText(ctx, definition, effects) : "";
      // About sound breaking up: audio effects only.
      hint.hidden =
        definition?.kind !== "audio" ||
        definition.cost === "light" ||
        !isOn(effects[definition.id]);
      for (const option of select.options) {
        const status = effects[option.value]?.status;
        option.disabled = status === "unsupported";
        // Not offered by the call's service (e.g. Krisp off LiveKit Cloud).
        option.hidden = status === "unavailable";
      }
      element.hidden = group.every(
        (d) => effects[d.id]?.status === "unavailable",
      );
    },
  };
}

function switchRow(
  ctx: DockContext,
  doc: Document,
  d: EffectDefinition,
  alerts: HTMLElement | null,
): Row {
  const button = el("button", {
    doc,
    className: "mav-control-switch",
    text: ctx.text(d.label),
    attrs: { type: "button", role: "switch", "data-effect": d.id },
  });
  const state = el("span", { doc, className: "mav-effect-state" });
  button.addEventListener("click", () => {
    const on = isOn(ctx.api.state.get().local.effects[d.id]);
    run(ctx, alerts, () => ctx.api.commands.setEffectEnabled(d.id, !on));
  });
  const element = el("div", {
    doc,
    className: "mav-control",
    attrs: { "data-control": "toggle" },
    children: [button, state],
  });
  return {
    element,
    render(effects) {
      const status = effects[d.id]?.status ?? "off";
      element.hidden = status === "unavailable";
      button.setAttribute("aria-checked", String(isOn(effects[d.id])));
      button.disabled = status === "unsupported";
      button.toggleAttribute("aria-busy", status === "starting");
      state.textContent = stateText(ctx, d, effects);
    },
  };
}

/**
 * Every registered effect, kept in step with its state: an exclusive group
 * is one choice (one runs at a time), any other effect a switch.
 */
export function renderEffects(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement | null,
): Rendered {
  const definitions = ctx.api.effects.list();
  const groups = new Map<string, EffectDefinition[]>();
  const rows: Row[] = [];
  for (const d of definitions) {
    if (!d.exclusiveGroup) rows.push(switchRow(ctx, doc, d, alerts));
    else
      groups.set(d.exclusiveGroup, [
        ...(groups.get(d.exclusiveGroup) ?? []),
        d,
      ]);
  }
  for (const [name, group] of groups)
    rows.push(groupRow(ctx, doc, name, group, alerts));
  const element = el("div", {
    doc,
    className: "mav-effects",
    children: rows.map((r) => r.element),
  });
  element.hidden = rows.length === 0;
  const render = (effects: Effects): void => {
    for (const row of rows) row.render(effects);
  };
  render(ctx.api.state.get().local.effects);
  const off = ctx.api.state.subscribe((s) => s.local.effects, render);
  return { element, dispose: off };
}
