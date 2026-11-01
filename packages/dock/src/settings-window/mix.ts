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

/** Nothing without an effect to mix: Channel level means nothing then. */
export function mixSection(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
): readonly Rendered[] {
  const mixed = ctx.api.effects
    .list()
    .filter((d) => draft.get("audioEffectMix")[d.id] !== undefined);
  if (mixed.length === 0) return [];
  const cut = draftSwitch(doc, draft, "cutTails", ctx.t("settings.cutTails"));
  const channelLabel = ctx.t("settings.channelLevel");
  const channel = levelSlider(doc, draft, {
    field: "channelLevel",
    label: channelLabel,
    read: () => draft.get("channelLevel"),
    write: (level) => {
      draft.set("channelLevel", level);
    },
  });
  const effects = mixed.map((d) => ({
    label: ctx.text(d.label),
    slider: levelSlider(doc, draft, {
      field: `audioEffectMix.${d.id}`,
      label: ctx.text(d.label),
      read: () => draft.get("audioEffectMix")[d.id] ?? 1,
      write: (level) => {
        draft.set("audioEffectMix", {
          ...draft.get("audioEffectMix"),
          [d.id]: level,
        });
      },
    }),
  }));
  return [
    {
      element: section(doc, ctx.t("settings.mix"), [
        row(
          doc,
          channelLabel,
          channel.element,
          ctx.t("settings.channelLevelHint"),
        ),
        ...effects.map((e) => row(doc, e.label, e.slider.element)),
        cut.element,
      ]),
      dispose() {
        cut.dispose();
        channel.dispose();
        for (const e of effects) e.slider.dispose();
      },
    },
  ];
}
