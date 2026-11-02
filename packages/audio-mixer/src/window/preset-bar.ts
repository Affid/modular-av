import { el } from "@modular-av/kit";
import { type Presets, PresetError } from "../presets/presets.ts";
import type { MixerContext, Rendered } from "./context.ts";

const NONE = "";

function button(
  doc: Document,
  text: string,
  field: string,
  onClick: () => void,
): HTMLButtonElement {
  const element = el("button", {
    doc,
    text,
    attrs: { type: "button", "data-field": field },
  });
  element.addEventListener("click", onClick);
  return element;
}

function presetSelect(ctx: MixerContext, doc: Document): HTMLSelectElement {
  const select = el("select", {
    doc,
    attrs: { "data-field": "preset", "aria-label": ctx.t("presets.choose") },
  });
  select.addEventListener("change", () => {
    if (select.value !== NONE)
      ctx.presets.apply(select.value).catch((error: unknown) => {
        ctx.onError(error);
      });
  });
  return select;
}

function optionsOf(
  ctx: MixerContext,
  doc: Document,
  presets: Presets,
): readonly HTMLOptionElement[] {
  return [
    el("option", {
      doc,
      text: ctx.t("presets.none"),
      attrs: { value: NONE, disabled: "" },
    }),
    ...presets
      .list()
      .map((p) => el("option", { doc, text: p.name, attrs: { value: p.id } })),
  ];
}

const skippedText = (ctx: MixerContext, presets: Presets): string => {
  const { missing, unsupported } = presets.skipped();
  return [
    missing.length
      ? ctx.t("presets.missing", { effects: missing.join(", ") })
      : "",
    unsupported.length
      ? ctx.t("presets.unsupported", { effects: unsupported.join(", ") })
      : "",
  ]
    .filter(Boolean)
    .join(" ");
};

function renderList(ctx: MixerContext, doc: Document, parts: Parts): void {
  const { presets } = ctx;
  const active = presets.active();
  const changed = presets.changed();
  parts.select.replaceChildren(...optionsOf(ctx, doc, presets));
  parts.select.value = active?.id ?? NONE;
  parts.changed.textContent = changed ? ctx.t("presets.changed") : "";
  parts.update.disabled = !changed;
  parts.remove.disabled = !active;
  parts.skipped.textContent = skippedText(ctx, presets);
}

interface Parts {
  readonly select: HTMLSelectElement;
  readonly changed: HTMLElement;
  readonly update: HTMLButtonElement;
  readonly remove: HTMLButtonElement;
  readonly skipped: HTMLElement;
}

const hint = (doc: Document, field: string): HTMLElement =>
  el("p", {
    doc,
    className: "mav-mixer-hint",
    attrs: { "data-field": field, role: "status" },
  });

/** Choosing, saving and deleting presets; applying goes through the queue. */
export function renderPresetBar(
  ctx: MixerContext,
  doc: Document,
  say: (text: string) => void,
): Rendered {
  const { presets } = ctx;
  const save = (name: string): void => {
    presets.saveAs(name).then(
      () => {
        input.value = "";
        say("");
      },
      (error: unknown) => {
        if (error instanceof PresetError)
          say(ctx.t(`presets.errors.${error.reason}`));
        else ctx.onError(error);
      },
    );
  };
  const removeActive = async (): Promise<void> => {
    const active = presets.active();
    if (!active) return;
    if (await ctx.confirm(ctx.t("presets.confirm", { name: active.name })))
      await presets.remove(active.id);
  };
  const input = el("input", {
    doc,
    attrs: {
      type: "text",
      maxlength: "64",
      "data-field": "presetName",
      "aria-label": ctx.t("presets.name"),
      placeholder: ctx.t("presets.name"),
    },
  });
  const parts: Parts = {
    select: presetSelect(ctx, doc),
    changed: hint(doc, "presetChanged"),
    skipped: hint(doc, "presetSkipped"),
    update: button(doc, ctx.t("presets.update"), "presetUpdate", () => {
      const active = presets.active();
      if (active) save(active.name);
    }),
    remove: button(doc, ctx.t("presets.delete"), "presetDelete", () => {
      removeActive().catch((error: unknown) => {
        ctx.onError(error);
      });
    }),
  };
  const render = (): void => {
    renderList(ctx, doc, parts);
  };
  render();
  const offPresets = presets.subscribe(render);
  const offState = ctx.api.state.subscribe((s) => s.local, render);
  return {
    element: el("section", {
      doc,
      className: "mav-mixer-presets",
      children: [
        el("h3", { doc, text: ctx.t("presets.title") }),
        el("div", {
          doc,
          className: "mav-mixer-preset-row",
          children: [parts.select, parts.update, parts.remove],
        }),
        parts.changed,
        el("div", {
          doc,
          className: "mav-mixer-preset-row",
          children: [
            input,
            button(doc, ctx.t("presets.save"), "presetSave", () => {
              save(input.value);
            }),
          ],
        }),
        parts.skipped,
      ],
    }),
    dispose() {
      offPresets();
      offState();
    },
  };
}
