import type { LocalState } from "@modular-av/api";
import { el } from "@modular-av/kit";
import type { MixerContext } from "./context.ts";
import { switchField } from "./fields.ts";
import { createVoiceTest, type VoiceTestStep } from "./voice-test.ts";

export interface Footer {
  readonly element: HTMLElement;
  update(local: LocalState): void;
  dispose(): void;
}

const STEPS_WITH_TEXT: ReadonlySet<VoiceTestStep> = new Set([
  "recording",
  "playing",
  "no-microphone",
  "failed",
]);

/** Keeping the GM out, and "Test my voice". */
export function renderFooter(ctx: MixerContext, doc: Document): Footer {
  const layers = ctx.layers;
  const keptOut = layers
    ? switchField(
        doc,
        ctx.t("layers.keepOut"),
        { "data-field": "keptOut" },
        (out) => {
          layers.setKeptOut(out).catch((error: unknown) => {
            ctx.onError(error);
          });
        },
      )
    : null;
  if (keptOut && layers) keptOut.input.checked = layers.keptOut();
  const status = el("p", {
    doc,
    className: "mav-mixer-hint",
    attrs: { "data-field": "voiceTestStatus", role: "status" },
  });
  const button = el("button", {
    doc,
    text: ctx.t("voiceTest.button"),
    attrs: { type: "button", "data-field": "voiceTest" },
  });
  const test = createVoiceTest(
    () => ctx.api.preview.voice(),
    ctx.recording,
    (step) => {
      status.textContent = STEPS_WITH_TEXT.has(step)
        ? ctx.t(`voiceTest.${step}`)
        : "";
      button.disabled = step === "recording" || step === "playing";
    },
  );
  button.addEventListener("click", () => {
    test.start().catch((error: unknown) => {
      ctx.onError(error);
    });
  });
  return {
    element: el("footer", {
      doc,
      className: "mav-mixer-footer",
      children: [
        keptOut?.element,
        button,
        el("p", {
          doc,
          className: "mav-mixer-hint",
          text: ctx.t("voiceTest.hint"),
        }),
        status,
      ],
    }),
    update() {
      if (keptOut && layers) keptOut.input.checked = layers.keptOut();
    },
    dispose() {
      test.stop();
    },
  };
}
