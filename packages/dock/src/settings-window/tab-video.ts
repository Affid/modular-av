import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { renderEffects } from "../panel/effects.ts";
import { cameraPreview } from "./camera-preview.ts";
import { contributedSections } from "./contributed.ts";
import { deviceOptions } from "./devices.ts";
import type { Draft } from "./draft.ts";
import { draftSelect, draftSwitch } from "./draft-inputs.ts";
import { draftEffects } from "./effect-draft.ts";
import { section } from "./fields.ts";

/** The camera's preview leading, the camera and its background beside it. */
function camera(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  alerts: HTMLElement,
): Rendered {
  const preview = cameraPreview(ctx, doc, draft);
  const choice = draftSelect(doc, draft, "videoInput", () =>
    deviceOptions(ctx, "videoInput", draft.get("videoInput")),
  );
  choice.element.id = "mav-settings-camera";
  const effects = renderEffects(ctx, doc, alerts, {
    model: draftEffects(draft),
    kind: "video",
  });
  const side = el("div", {
    doc,
    className: "mav-settings-camera-side",
    children: [
      el("div", {
        doc,
        className: "mav-control",
        children: [
          el("label", {
            doc,
            text: ctx.t("settings.camera"),
            attrs: { for: choice.element.id },
          }),
          choice.element,
        ],
      }),
      effects.element,
    ],
  });
  return {
    element: section(doc, ctx.t("settings.camera"), [
      el("div", {
        doc,
        className: "mav-settings-camera",
        children: [preview.element, side],
      }),
    ]),
    dispose() {
      for (const part of [preview, choice, effects]) part.dispose();
    },
  };
}

/** The Video tab: the camera, its background, others' video. */
export function videoTab(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  alerts: HTMLElement,
): readonly Rendered[] {
  const receive = draftSwitch(
    doc,
    draft,
    "receiveVideo",
    ctx.t("settings.receiveVideo"),
  );
  return [
    camera(ctx, doc, draft, alerts),
    {
      element: section(doc, ctx.t("settings.othersVideo"), [receive.element]),
      dispose: () => {
        receive.dispose();
      },
    },
    ...contributedSections(ctx, doc, alerts, "video"),
  ];
}
