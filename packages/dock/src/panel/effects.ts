import type { EffectDefinition, EffectState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";
import { effectGroup, type GroupRow } from "./effect-group.ts";
import type { Effects } from "./effect-text.ts";

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

/**
 * Where a group's choice comes from and goes: the call itself (the quick
 * controls), or a draft the settings window saves later.
 */
export interface EffectModel {
  chosen(group: readonly EffectDefinition[]): string;
  /** `id` on in its group, or the group off for "". */
  choose(group: readonly EffectDefinition[], id: string): void;
  subscribe(listener: () => void): () => void;
}

/** The call's own effects: a choice turns them on and off at once. */
export function liveEffects(
  ctx: DockContext,
  alerts: HTMLElement | null,
): EffectModel {
  const effects = (): Effects => ctx.api.state.get().local.effects;
  return {
    chosen: (group) => chosenInGroup(group, effects()),
    choose(group, id) {
      const current = chosenInGroup(group, effects());
      if (id === current) return;
      run(ctx, alerts, () =>
        id
          ? ctx.api.commands.setEffectEnabled(id, true)
          : ctx.api.commands.setEffectEnabled(current, false),
      );
    },
    subscribe: (listener) =>
      ctx.api.state.subscribe((s) => s.local.effects, listener),
  };
}

/** Exclusive groups by name; an effect of its own is a group of one. */
export function groupsOf(
  definitions: readonly EffectDefinition[],
): readonly (readonly [string, readonly EffectDefinition[]])[] {
  const groups = new Map<string, EffectDefinition[]>();
  for (const d of definitions) {
    const name = d.exclusiveGroup ?? d.id;
    groups.set(name, [...(groups.get(name) ?? []), d]);
  }
  return [...groups];
}

export interface EffectsOptions {
  /** Where choices come from and go; the call's own if not given. */
  readonly model?: EffectModel;
  /** Only audio or only video effects (a settings tab's). */
  readonly kind?: EffectDefinition["kind"];
}

/**
 * Every registered effect group as one choice, with the controls attached
 * to the chosen effect under it, kept in step with the state.
 */
export function renderEffects(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement | null,
  options: EffectsOptions = {},
): Rendered {
  const model = options.model ?? liveEffects(ctx, alerts);
  const definitions = ctx.api.effects
    .list()
    .filter((d) => !options.kind || d.kind === options.kind);
  const rows: GroupRow[] = groupsOf(definitions).map(([name, group]) =>
    effectGroup(ctx, doc, { name, group, model, alerts }),
  );
  const element = el("div", {
    doc,
    className: "mav-effects",
    children: rows.map((r) => r.element),
  });
  element.hidden = rows.length === 0;
  const render = (): void => {
    const effects = ctx.api.state.get().local.effects;
    for (const row of rows) row.render(effects);
  };
  render();
  const offState = ctx.api.state.subscribe((s) => s.local.effects, render);
  const offModel = options.model ? model.subscribe(render) : () => undefined;
  return {
    element,
    dispose() {
      offState();
      offModel();
      for (const row of rows) row.dispose();
    },
  };
}
