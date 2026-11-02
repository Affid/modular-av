import type { LocalState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { audioEffectsOf, type Lane, lanesOf } from "../model/pipeline.ts";
import { createWriter, type Writer } from "../model/queue.ts";
import { type Warning, warningsOf } from "../model/warnings.ts";
import { type Channel, renderChannel } from "./channel.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { type Footer, renderFooter } from "./footer.ts";

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** What decides the rows drawn; a level changes in place instead. */
const shapeOf = (lanes: readonly Lane[], local: LocalState): string =>
  JSON.stringify({
    lanes: lanes.map((lane) => lane.effects.map((d) => d.id)),
    chosen: local.chosenEffects,
    effects: local.effects,
    mixed: Object.keys(local.audioEffectMix).sort(),
  });

const OPPOSITE: Readonly<Record<string, string>> = { up: "down", down: "up" };

/** Moving to the top disables the button pressed: its sibling takes over. */
function restoreFocus(root: HTMLElement, field: string | undefined): void {
  if (!field) return;
  const find = (name: string) =>
    root.querySelector<HTMLButtonElement>(`[data-field="${name}"]`);
  const found = find(field);
  if (found && !found.disabled) {
    found.focus();
    return;
  }
  const [direction = "", ...rest] = field.split(".");
  const other = OPPOSITE[direction];
  if (other) find([other, ...rest].join("."))?.focus();
}

function warningLines(
  ctx: MixerContext,
  doc: Document,
  warnings: readonly Warning[],
): readonly HTMLElement[] {
  const nameOf = (id: string): string => {
    const definition = ctx.api.effects.list().find((d) => d.id === id);
    return definition ? ctx.text(definition.label) : id;
  };
  return warnings.map(({ key, effect }) =>
    el("li", {
      doc,
      text: ctx.t(`warnings.${key}`, effect ? { effect: nameOf(effect) } : {}),
      attrs: { "data-warning": key },
    }),
  );
}

const emptyHint = (ctx: MixerContext, doc: Document): Rendered => ({
  element: el("div", {
    doc,
    className: "mav-mixer",
    children: [
      el("p", { doc, className: "mav-mixer-hint", text: ctx.t("empty") }),
    ],
  }),
  dispose: () => undefined,
});

interface Drawn {
  channel: Channel | null;
  shape: string;
}

/** Follows the state: the rows redraw if the shape changed, levels in place. */
function follow(
  ctx: MixerContext,
  doc: Document,
  parts: {
    readonly slot: HTMLElement;
    readonly warnings: HTMLElement;
    readonly footer: Footer;
    readonly writes: Writer;
  },
): { dispose(): void } {
  const { slot, warnings, footer, writes } = parts;
  const drawn: Drawn = { channel: null, shape: "" };
  const redraw = (lanes: readonly Lane[], local: LocalState): void => {
    const active = doc.activeElement as HTMLElement | null;
    const field = slot.contains(active) ? active?.dataset.field : undefined;
    drawn.channel?.dispose();
    drawn.channel = renderChannel(ctx, doc, lanes, local, writes);
    slot.replaceChildren(drawn.channel.element);
    restoreFocus(slot, field);
  };
  const update = (local: LocalState): void => {
    const definitions = ctx.api.effects.list();
    const lanes = lanesOf(definitions, local);
    const shape = shapeOf(lanes, local);
    if (shape === drawn.shape) drawn.channel?.update(local);
    else redraw(lanes, local);
    drawn.shape = shape;
    footer.update(local);
    warnings.replaceChildren(
      ...warningLines(
        ctx,
        doc,
        warningsOf(definitions, local, ctx.automationRate),
      ),
    );
  };
  update(ctx.api.state.get().local);
  const off = ctx.api.state.subscribe((s) => s.local, update);
  return {
    dispose() {
      off();
      drawn.channel?.dispose();
    },
  };
}

/** The window's content, drawn only from the API: it knows no effect. */
export function renderMixer(ctx: MixerContext, doc: Document): Rendered {
  if (audioEffectsOf(ctx.api.effects.list()).length === 0)
    return emptyHint(ctx, doc);
  const alerts = el("p", {
    doc,
    className: "mav-mixer-alert",
    attrs: { role: "alert" },
  });
  const writes = createWriter((error) => {
    ctx.onError(error);
    alerts.textContent = ctx.t("failed", { reason: reasonOf(error) });
  });
  const slot = el("div", { doc });
  const warnings = el("ul", { doc, className: "mav-mixer-warnings" });
  const footer = renderFooter(ctx, doc, writes);
  const following = follow(ctx, doc, { slot, warnings, footer, writes });
  return {
    element: el("div", {
      doc,
      className: "mav-mixer",
      children: [alerts, warnings, slot, footer.element],
    }),
    dispose() {
      following.dispose();
      footer.dispose();
    },
  };
}
