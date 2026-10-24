import type { AVState, DeviceKind, VoiceMode } from "@modular-av/api";
import { createMeter, el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { run } from "../ui/run.ts";
import {
  type Option,
  row,
  section,
  selectField,
  switchField,
} from "./fields.ts";

const KINDS: readonly [DeviceKind, string][] = [
  ["audioInput", "settings.microphone"],
  ["videoInput", "settings.camera"],
  ["audioOutput", "settings.speakers"],
];

/** Tuples of state slices are equal when each slice is the same object. */
const shallow = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
    : Object.is(a, b);

const watch =
  (ctx: DockContext, select: (s: AVState) => unknown) =>
  (render: () => void): (() => void) =>
    ctx.api.state.subscribe(select, render, { equals: shallow });

/**
 * The devices of a kind and the one chosen. A chosen device the browser
 * doesn't list now (unplugged) still shows as chosen, not as a blank.
 */
function deviceChoice(
  ctx: DockContext,
  kind: DeviceKind,
): { readonly options: readonly Option[]; readonly value: string } {
  const state = ctx.api.state.get();
  const chosen = state.local.chosenDevices[kind];
  const listed = state.devices[kind].map((d, i) => ({
    value: d.id,
    label: d.label || ctx.t("settings.unnamed", { number: String(i + 1) }),
  }));
  const missing =
    chosen !== "default" && !listed.some((d) => d.value === chosen)
      ? [{ value: chosen, label: ctx.t("settings.missingDevice") }]
      : [];
  return {
    options: [
      { value: "default", label: ctx.t("settings.systemDefault") },
      ...listed,
      ...missing,
    ],
    value: chosen,
  };
}

/** The player's level, with the gate's threshold and state. */
function selfMeter(ctx: DockContext, doc: Document): Rendered {
  const meter = createMeter(doc, { label: ctx.t("menu.level") });
  const off = ctx.api.meters.subscribe(ctx.selfId, meter.element, (r) => {
    meter.set(r);
  });
  return { element: meter.element, dispose: off };
}

/** Microphone, camera and speakers, with a level meter and a camera preview. */
export function devicesSection(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): readonly Rendered[] {
  const fields = KINDS.map(([kind, label]) => {
    const field = selectField(
      ctx,
      doc,
      {
        read: () => deviceChoice(ctx, kind),
        write: (id) => ctx.api.commands.setDevice(kind, id),
        subscribe: watch(
          ctx,
          (s) => [s.devices, s.local.chosenDevices] as const,
        ),
      },
      alerts,
    );
    return { ...field, element: row(doc, ctx.t(label), field.element) };
  });
  const meter = selfMeter(ctx, doc);
  const preview = el("video", {
    doc,
    className: "mav-settings-preview",
    attrs: { autoplay: "", playsinline: "", muted: "" },
  });
  preview.muted = true;
  const detach = ctx.api.media.attach(ctx.selfId, "camera", preview);
  const element = section(doc, ctx.t("settings.devices"), [
    ...fields.map((f) => f.element),
    meter.element,
    preview,
  ]);
  return [...fields, meter, { element, dispose: detach }];
}

const MODES: readonly VoiceMode[] = ["always", "activity", "ptt"];

/** Input mode, the push to talk key and the input sensitivity. */
export function voiceSection(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): readonly Rendered[] {
  const local = (): AVState["local"] => ctx.api.state.get().local;
  const mode = selectField(
    ctx,
    doc,
    {
      read: () => ({
        options: MODES.map((m) => ({
          value: m,
          label: ctx.t(`settings.mode-${m}`),
        })),
        value: local().voiceMode,
      }),
      write: (value) => ctx.api.commands.setVoiceMode(value as VoiceMode),
      subscribe: watch(ctx, (s) => s.local.voiceMode),
    },
    alerts,
  );
  const auto = switchField(
    ctx,
    doc,
    {
      label: ctx.t("settings.automatic"),
      read: () => local().inputSensitivity.auto,
      write: (on) => ctx.api.commands.setInputSensitivity({ auto: on }),
      subscribe: watch(ctx, (s) => s.local.inputSensitivity),
    },
    alerts,
  );
  const threshold = thresholdField(ctx, doc, alerts);
  const meter = selfMeter(ctx, doc);
  const element = section(doc, ctx.t("settings.voice"), [
    row(doc, ctx.t("settings.voiceMode"), mode.element),
    ...pushToTalk(ctx, doc),
    el("h3", { doc, text: ctx.t("settings.sensitivity") }),
    auto.element,
    row(doc, ctx.t("settings.threshold"), threshold.element),
    meter.element,
  ]);
  return [mode, auto, threshold, meter, { element, dispose: () => undefined }];
}

/** Foundry's push to talk key, which Foundry's own controls change. */
function pushToTalk(ctx: DockContext, doc: Document): readonly HTMLElement[] {
  const keys = ctx.pushToTalkKeys();
  const change = el("button", {
    doc,
    className: "mav-control-button",
    text: ctx.t("settings.changeKeys"),
    attrs: { type: "button" },
  });
  change.addEventListener("click", () => {
    ctx.openControls();
  });
  const key = keys.length > 0 ? keys.join(", ") : ctx.t("settings.noKey");
  return [
    el("p", { doc, text: ctx.t("settings.pushToTalkKey", { key }) }),
    change,
  ];
}

/** The gate's fixed level, in dBFS, used while sensitivity isn't automatic. */
function thresholdField(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): Rendered {
  const input = el("input", {
    doc,
    attrs: { type: "range", min: "-100", max: "0", step: "1" },
  });
  const render = (): void => {
    const { auto, threshold } = ctx.api.state.get().local.inputSensitivity;
    input.value = String(threshold);
    input.disabled = auto;
    input.setAttribute("aria-valuetext", `${String(threshold)} dB`);
  };
  input.addEventListener("change", () => {
    run(ctx, alerts, () =>
      ctx.api.commands.setInputSensitivity({ threshold: Number(input.value) }),
    );
  });
  render();
  return {
    element: input,
    dispose: ctx.api.state.subscribe((s) => s.local.inputSensitivity, render),
  };
}

/** Whether others' video shows on this client. */
export function videoSection(
  ctx: DockContext,
  doc: Document,
  alerts: HTMLElement,
): readonly Rendered[] {
  const receive = switchField(
    ctx,
    doc,
    {
      label: ctx.t("settings.receiveVideo"),
      read: () => ctx.api.state.get().local.receiveVideo,
      write: (on) => ctx.api.commands.setReceiveVideo(on),
      subscribe: watch(ctx, (s) => s.local.receiveVideo),
    },
    alerts,
  );
  return [
    receive,
    {
      element: section(doc, ctx.t("settings.video"), [receive.element]),
      dispose: () => undefined,
    },
  ];
}
