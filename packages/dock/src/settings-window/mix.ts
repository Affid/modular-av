import type { EffectDefinition } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import type { Draft } from "./draft.ts";
import { draftSwitch } from "./draft-inputs.ts";
import { row, section } from "./fields.ts";

const PERCENT = 100;

interface Level {
  /** Tells the control apart, as `data-field` does for the others. */
  readonly field: string;
  /** Said by screen readers: the row's label reaches only the wrapper. */
  readonly label: string;
  read(): number;
  write(level: number): void;
}

function levelSlider(doc: Document, draft: Draft, level: Level): Rendered {
  const input = el("input", {
    doc,
    attrs: {
      type: "range",
      min: "0",
      max: String(PERCENT),
      step: "1",
      "data-field": level.field,
      "aria-label": level.label,
    },
  });
  const value = el("output", { doc });
  const element = el("div", {
    doc,
    className: "mav-settings-level",
    children: [input, value],
  });
  const render = (): void => {
    const percent = Math.round(level.read() * PERCENT);
    input.value = String(percent);
    value.textContent = `${String(percent)}%`;
  };
  input.addEventListener("input", () => {
    level.write(Number(input.value) / PERCENT);
  });
  render();
  return { element, dispose: draft.subscribe(render) };
}

function channelRow(ctx: DockContext, doc: Document, draft: Draft): Rendered {
  const label = ctx.t("settings.channelLevel");
  const slider = levelSlider(doc, draft, {
    field: "channelLevel",
    label,
    read: () => draft.get("channelLevel"),
    write: (level) => {
      draft.set("channelLevel", level);
    },
  });
  return {
    element: row(
      doc,
      label,
      slider.element,
      ctx.t("settings.channelLevelHint"),
    ),
    dispose() {
      slider.dispose();
    },
  };
}

function effectRow(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  definition: EffectDefinition,
): Rendered {
  const { id } = definition;
  const label = ctx.text(definition.label);
  const slider = levelSlider(doc, draft, {
    field: `audioEffectMix.${id}`,
    label,
    read: () => draft.get("audioEffectMix")[id] ?? 1,
    write: (level) => {
      draft.set("audioEffectMix", {
        ...draft.get("audioEffectMix"),
        [id]: level,
      });
    },
  });
  return {
    element: row(doc, label, slider.element),
    dispose() {
      slider.dispose();
    },
  };
}

/**
 * Nothing without an effect to mix. Channel level needs a send: nothing else
 * can carry the voice while it's turned down.
 */
export function mixSection(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
): readonly Rendered[] {
  const mixed = ctx.api.effects
    .list()
    .filter((d) => draft.get("audioEffectMix")[d.id] !== undefined);
  if (mixed.length === 0) return [];
  const places = ctx.api.state.get().local.audioEffectPlaces;
  const rows = [
    ...(mixed.some((d) => places[d.id] === "send")
      ? [channelRow(ctx, doc, draft)]
      : []),
    ...mixed.map((d) => effectRow(ctx, doc, draft, d)),
  ];
  const cut = draftSwitch(doc, draft, "cutTails", ctx.t("settings.cutTails"));
  return [
    {
      element: section(doc, ctx.t("settings.mix"), [
        ...rows.map((r) => r.element),
        cut.element,
      ]),
      dispose() {
        cut.dispose();
        for (const r of rows) r.dispose();
      },
    },
  ];
}
