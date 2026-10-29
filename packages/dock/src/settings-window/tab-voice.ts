import type { GateFallback, SettingsHost, VoiceMode } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { Rendered } from "../contributions/controls.ts";
import type { DockContext } from "../context.ts";
import { renderEffects } from "../panel/effects.ts";
import { contributedSections } from "./contributed.ts";
import { deviceOptions } from "./devices.ts";
import type { Draft } from "./draft.ts";
import { draftSelect, draftSwitch } from "./draft-inputs.ts";
import { draftEffects } from "./effect-draft.ts";
import { row, section } from "./fields.ts";
import { pushToTalkKey } from "./ptt-key.ts";
import { sensitivityBar } from "./sensitivity.ts";

const MODES: readonly VoiceMode[] = ["always", "activity", "ptt"];
const FALLBACKS: readonly GateFallback[] = ["send", "mute"];

function devices(ctx: DockContext, doc: Document, draft: Draft): Rendered {
  const mic = draftSelect(doc, draft, "audioInput", () =>
    deviceOptions(ctx, "audioInput", draft.get("audioInput")),
  );
  const speakers = draftSelect(doc, draft, "audioOutput", () =>
    deviceOptions(ctx, "audioOutput", draft.get("audioOutput")),
  );
  return {
    element: section(doc, ctx.t("settings.devices"), [
      row(doc, ctx.t("settings.microphone"), mic.element),
      row(doc, ctx.t("settings.speakers"), speakers.element),
    ]),
    dispose() {
      mic.dispose();
      speakers.dispose();
    },
  };
}

/** The input mode, and what only one mode uses: its key, or its level. */
function input(ctx: DockContext, doc: Document, draft: Draft): Rendered {
  const mode = draftSelect(doc, draft, "voiceMode", () =>
    MODES.map((m) => ({ value: m, label: ctx.t(`settings.mode-${m}`) })),
  );
  const key = pushToTalkKey(ctx, doc, draft);
  const auto = draftSwitch(
    doc,
    draft,
    "sensitivityAuto",
    ctx.t("settings.automatic"),
  );
  const bar = sensitivityBar(ctx, doc, draft);
  const fallback = draftSelect(doc, draft, "gateFallback", () =>
    FALLBACKS.map((f) => ({
      value: f,
      label: ctx.t(`settings.fallback-${f}`),
    })),
  );
  const sensitivity = el("div", {
    doc,
    className: "mav-settings-group",
    children: [
      el("h3", { doc, text: ctx.t("settings.sensitivity") }),
      auto.element,
      bar.element,
      row(doc, ctx.t("settings.gateFallback"), fallback.element),
    ],
  });
  const render = (): void => {
    key.element.hidden = draft.get("voiceMode") !== "ptt";
    sensitivity.hidden = draft.get("voiceMode") !== "activity";
  };
  render();
  const off = draft.subscribe(render);
  return {
    element: section(doc, ctx.t("settings.voice"), [
      row(doc, ctx.t("settings.voiceMode"), mode.element),
      key.element,
      sensitivity,
    ]),
    dispose() {
      off();
      for (const part of [mode, key, auto, bar, fallback]) part.dispose();
    },
  };
}

/** No effect module at all: say they exist; a GM can go plan them. */
function effectModules(
  ctx: DockContext,
  doc: Document,
  host: SettingsHost,
): HTMLElement[] {
  const hint = el("p", {
    doc,
    className: "mav-settings-hint",
    text: ctx.t(host.openModules ? "effects.modulesGm" : "effects.modules"),
  });
  if (!host.openModules) return [hint];
  const plan = el("button", {
    doc,
    className: "mav-control-button",
    text: ctx.t("settings.modules"),
    attrs: { type: "button" },
  });
  plan.addEventListener("click", () => host.openModules?.());
  return [hint, plan];
}

/** The Voice tab: devices, input mode, sensitivity, the voice's effects. */
export function voiceTab(
  ctx: DockContext,
  doc: Document,
  draft: Draft,
  host: SettingsHost,
  alerts: HTMLElement,
): readonly Rendered[] {
  const effects = renderEffects(ctx, doc, alerts, {
    model: draftEffects(draft),
    kind: "audio",
  });
  const none = ctx.api.effects.list().length === 0;
  return [
    devices(ctx, doc, draft),
    input(ctx, doc, draft),
    {
      element: section(
        doc,
        ctx.t("effects.title"),
        none ? effectModules(ctx, doc, host) : [effects.element],
      ),
      dispose: () => {
        effects.dispose();
      },
    },
    ...contributedSections(ctx, doc, alerts, "voice"),
  ];
}
