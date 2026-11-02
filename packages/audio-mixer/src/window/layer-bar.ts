import type { ParticipantState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import { type GmLayers, TABLE } from "../layers/gm-layers.ts";
import type { Layer } from "../layers/layer.ts";
import type { MixerContext, Rendered } from "./context.ts";
import { switchField } from "./fields.ts";

const others = (ctx: MixerContext): readonly ParticipantState[] =>
  Object.values(ctx.api.state.get().participants)
    .filter((p) => !p.isLocal)
    .sort((a, b) => a.name.localeCompare(b.name));

function select(
  doc: Document,
  field: string,
  label: string,
  options: readonly (readonly [string, string])[],
): HTMLSelectElement {
  return el("select", {
    doc,
    attrs: { "data-field": field, "aria-label": label },
    children: options.map(([value, text]) =>
      el("option", { doc, text, attrs: { value } }),
    ),
  });
}

interface OnNow {
  readonly target: string;
  readonly who: string;
  readonly layer: Layer;
}

function layersOn(ctx: MixerContext, gmLayers: GmLayers): readonly OnNow[] {
  const table = gmLayers.tableLayer();
  return [
    ...(table
      ? [{ target: TABLE, who: ctx.t("layers.everyone"), layer: table }]
      : []),
    ...others(ctx).flatMap((p) => {
      const layer = gmLayers.personalLayer(p.id);
      return layer ? [{ target: p.id, who: p.name, layer }] : [];
    }),
  ];
}

function onLine(
  ctx: MixerContext,
  doc: Document,
  gmLayers: GmLayers,
  on: OnNow,
  after: () => void,
): HTMLElement {
  const end = el("button", {
    doc,
    text: ctx.t("layers.end"),
    attrs: { type: "button", "data-field": `layerEnd.${on.target}` },
  });
  end.addEventListener("click", () => {
    gmLayers
      .end(on.target)
      .then(after)
      .catch((error: unknown) => {
        ctx.onError(error);
      });
  });
  return el("p", {
    doc,
    className: "mav-mixer-layer",
    children: [
      el("span", {
        doc,
        text: ctx.t("layers.on", { who: on.who, label: on.layer.label }),
      }),
      end,
    ],
  });
}

function pickers(ctx: MixerContext, doc: Document) {
  const presets = ctx.presets.list();
  return {
    presets,
    preset: select(
      doc,
      "layerPreset",
      ctx.t("layers.preset"),
      presets.map((p) => [p.id, p.name]),
    ),
    target: select(doc, "layerTarget", ctx.t("layers.target"), [
      [TABLE, ctx.t("layers.everyone")],
      ...others(ctx).map((p): [string, string] => [p.id, p.name]),
    ]),
    gms: switchField(
      doc,
      ctx.t("layers.includeGMs"),
      { "data-field": "layerGMs" },
      () => undefined,
    ),
  };
}

type Pickers = ReturnType<typeof pickers>;

/** A redraw keeps what the GM picked, as far as it still exists. */
function keepPicks(from: Pickers | null, to: Pickers): void {
  if (!from) return;
  const keep = (was: HTMLSelectElement, next: HTMLSelectElement): void => {
    if ([...next.options].some((o) => o.value === was.value))
      next.value = was.value;
  };
  keep(from.preset, to.preset);
  keep(from.target, to.target);
  to.gms.input.checked = from.gms.input.checked;
}

/** A GM's way to lay a saved preset over the table or one player. */
export function renderLayerBar(
  ctx: MixerContext,
  doc: Document,
  gmLayers: GmLayers,
): Rendered {
  const element = el("section", { doc, className: "mav-mixer-presets" });
  let shown: Pickers | null = null;
  const render = (): void => {
    const picks = pickers(ctx, doc);
    keepPicks(shown, picks);
    shown = picks;
    const { presets, preset, target, gms } = picks;
    const apply = el("button", {
      doc,
      text: ctx.t("layers.apply"),
      attrs: { type: "button", "data-field": "layerApply" },
    });
    apply.disabled = presets.length === 0;
    apply.addEventListener("click", () => {
      const chosen = presets.find((p) => p.id === preset.value);
      if (!chosen) return;
      gmLayers
        .applyPreset(chosen, {
          target: target.value,
          includeGMs: gms.input.checked,
        })
        .then(render)
        .catch((error: unknown) => {
          ctx.onError(error);
        });
    });
    element.replaceChildren(
      el("h3", { doc, text: ctx.t("layers.title") }),
      el("p", {
        doc,
        className: "mav-mixer-hint",
        text: ctx.t(presets.length ? "layers.hint" : "layers.noPresets"),
      }),
      el("div", {
        doc,
        className: "mav-mixer-preset-row",
        children: [preset, target, gms.element, apply],
      }),
      ...layersOn(ctx, gmLayers).map((on) =>
        onLine(ctx, doc, gmLayers, on, render),
      ),
    );
  };
  render();
  const stops = [
    ctx.presets.subscribe(render),
    ctx.api.state.subscribe((s) => s.participants, render),
    ctx.layers?.subscribe(render),
  ];
  return {
    element,
    dispose() {
      for (const stop of stops) stop?.();
    },
  };
}
