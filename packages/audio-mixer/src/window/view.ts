import type { LocalState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { audioEffectsOf } from "../model/pipeline.ts";
import { type Warning, warningsOf } from "../model/warnings.ts";
import { renderChain } from "./chain.ts";
import type { MixerContext, MixerView, Rendered } from "./context.ts";
import { type Footer, renderFooter } from "./footer.ts";
import { renderLayerBanner } from "./layer-banner.ts";
import { renderPresetBar } from "./preset-bar.ts";
import { withTable } from "./tabs.ts";

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

/** The warnings and the footer follow the state; the chain follows itself. */
function follow(
  ctx: MixerContext,
  doc: Document,
  warnings: HTMLElement,
  footer: Footer,
): () => void {
  const update = (local: LocalState): void => {
    footer.update(local);
    warnings.replaceChildren(
      ...warningLines(
        ctx,
        doc,
        warningsOf(ctx.api.effects.list(), local, ctx.automationRate),
      ),
    );
  };
  update(ctx.api.state.get().local);
  return ctx.api.state.subscribe((s) => s.local, update);
}

/** The window's content, drawn only from the API: it knows no effect. */
export function renderMixer(ctx: MixerContext, doc: Document): MixerView {
  const mine = renderChannelView(ctx, doc);
  return ctx.table ? withTable(ctx, doc, ctx.table, mine) : mine;
}

/** A player's own channel. */
function renderChannelView(ctx: MixerContext, doc: Document): Rendered {
  if (audioEffectsOf(ctx.api.effects.list()).length === 0)
    return emptyHint(ctx, doc);
  const alerts = el("p", {
    doc,
    className: "mav-mixer-alert",
    attrs: { role: "alert" },
  });
  const { writes } = ctx;
  const say = (text: string): void => {
    alerts.textContent = text;
  };
  const offFailure = writes.onFailure((error) => {
    say(ctx.t("failed", { reason: reasonOf(error) }));
  });
  const presets = renderPresetBar(ctx, doc, say);
  const banner = ctx.layers
    ? renderLayerBanner(ctx, doc, ctx.layers)
    : undefined;
  const chain = renderChain(ctx, doc, writes);
  const warnings = el("ul", { doc, className: "mav-mixer-warnings" });
  const footer = renderFooter(ctx, doc);
  const offFollow = follow(ctx, doc, warnings, footer);
  return {
    element: el("div", {
      doc,
      className: "mav-mixer",
      // What comes and goes sits after all that stays: nothing moves away.
      children: [
        presets.element,
        chain.element,
        footer.element,
        banner?.element,
        warnings,
        alerts,
      ],
    }),
    dispose() {
      offFailure();
      presets.dispose();
      banner?.dispose();
      offFollow();
      chain.dispose();
      footer.dispose();
    },
  };
}
