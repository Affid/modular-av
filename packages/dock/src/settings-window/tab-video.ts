import type { VideoResolution } from "@modular-av/api";
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

const RESOLUTIONS: readonly VideoResolution[] = [
  "default",
  "360p",
  "720p",
  "1080p",
];

/** A labelled control in the camera's column. */
const control = (
  doc: Document,
  label: string,
  input: HTMLElement,
): HTMLElement =>
  el("div", {
    doc,
    className: "mav-control",
    children: [
      el("label", { doc, text: label, attrs: { for: input.id } }),
      input,
    ],
  });

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
  const size = draftSelect(doc, draft, "videoResolution", () =>
    RESOLUTIONS.map((r) => ({
      value: r,
      label: ctx.t(`settings.resolution-${r}`),
    })),
  );
  size.element.id = "mav-settings-camera-resolution";
  const effects = renderEffects(ctx, doc, alerts, {
    model: draftEffects(draft),
    kind: "video",
  });
  const side = el("div", {
    doc,
    className: "mav-settings-camera-side",
    children: [
      control(doc, ctx.t("settings.camera"), choice.element),
      control(doc, ctx.t("settings.resolution"), size.element),
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
      for (const part of [preview, choice, size, effects]) part.dispose();
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
