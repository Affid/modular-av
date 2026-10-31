import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import type { Draft } from "./draft.ts";
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

/** A slider in percent, with its value beside it. */
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

/**
 * Channel level and a slider per effect the core can mix; nothing without
 * such an effect, as Channel level means nothing then.
 */
export function mixSection(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
): readonly Rendered[] {
  const mixed = ctx.api.effects
    .list()
    .filter((d) => draft.get("effectMix")[d.id] !== undefined);
  if (mixed.length === 0) return [];
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
      field: `effectMix.${d.id}`,
      label: ctx.text(d.label),
      read: () => draft.get("effectMix")[d.id] ?? 1,
      write: (level) => {
        draft.set("effectMix", { ...draft.get("effectMix"), [d.id]: level });
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
      ]),
      dispose() {
        channel.dispose();
        for (const e of effects) e.slider.dispose();
      },
    },
  ];
}
