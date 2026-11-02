import { el } from "@modular-av/kit";
import type { Layers, LayerStatus } from "../layers/layers.ts";
import type { MixerContext, Rendered } from "./context.ts";

function actionButton(
  doc: Document,
  text: string,
  field: string,
  run: () => Promise<void>,
  onError: (error: unknown) => void,
): HTMLElement {
  const button = el("button", {
    doc,
    text,
    attrs: { type: "button", "data-field": field },
  });
  button.addEventListener("click", () => {
    run().catch(onError);
  });
  return button;
}

function layerLine(
  ctx: MixerContext,
  doc: Document,
  layers: Layers,
  { id, label, state }: LayerStatus,
): HTMLElement {
  const refused = state === "refused";
  const onError = (error: unknown): void => {
    ctx.onError(error);
  };
  return el("p", {
    doc,
    className: "mav-mixer-layer",
    attrs: { "data-layer": id },
    children: [
      el("span", { doc, text: ctx.t(`layers.states.${state}`, { label }) }),
      state === "kept-out"
        ? null
        : refused
          ? actionButton(
              doc,
              ctx.t("layers.accept"),
              `accept.${id}`,
              () => layers.accept(id),
              onError,
            )
          : actionButton(
              doc,
              ctx.t("layers.refuse"),
              `refuse.${id}`,
              () => layers.refuse(id),
              onError,
            ),
    ],
  });
}

/** What a GM laid over this player's voice, and how to refuse it. */
export function renderLayerBanner(
  ctx: MixerContext,
  doc: Document,
  layers: Layers,
): Rendered {
  const element = el("div", { doc, className: "mav-mixer-layers" });
  const render = (): void => {
    element.replaceChildren(
      ...layers.states().map((s) => layerLine(ctx, doc, layers, s)),
    );
  };
  render();
  return { element, dispose: layers.subscribe(render) };
}
