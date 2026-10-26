// @vitest-environment happy-dom
import type {
  AudioEffectDefinition,
  EffectCost,
  EffectState,
  VideoEffectDefinition,
} from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it } from "vitest";
import { openQuickControls } from "../src/panel/quick-controls.ts";
import { settle, type TestDock, testDock } from "./context.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });

const model = (id: string, cost: EffectCost): AudioEffectDefinition => ({
  id,
  kind: "audio",
  label: id,
  stage: "denoise",
  exclusiveGroup: "noise-suppression",
  cost,
  isSupported: () => true,
  create: () => Promise.reject(new Error("unused")),
});

function noiseModels(effects: Readonly<Record<string, EffectState>>): TestDock {
  const dock = testDock({
    state: avState({ participants: [me], local: { effects } }),
  });
  dock.api.effects.register(model("rnnoise", "light"));
  dock.api.effects.register(model("gtcrn", "medium"));
  dock.api.effects.register(model("krisp", "light"));
  return dock;
}

const off: EffectState = { status: "off", error: null };

function open(dock: TestDock) {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const popover = openQuickControls(dock.ctx, anchor);
  const select = popover.element.querySelector<HTMLSelectElement>(
    '[data-effect-group="noise-suppression"]',
  );
  if (!select) throw new Error("no group");
  const option = (id: string): HTMLOptionElement | undefined =>
    [...select.options].find((o) => o.value === id);
  const hint = (): HTMLElement | null =>
    select
      .closest(".mav-control")
      ?.querySelector<HTMLElement>(".mav-settings-hint") ?? null;
  return {
    popover,
    select,
    option,
    hint,
    text: () => popover.element.textContent,
  };
}

describe("the noise cancellation choice", () => {
  it("names each model's cost", () => {
    const view = open(noiseModels({ rnnoise: off, gtcrn: off, krisp: off }));

    expect(view.option("rnnoise")?.textContent).toBe("rnnoise · Light");
    expect(view.option("gtcrn")?.textContent).toBe("gtcrn · Medium");
  });

  it("doesn't offer an effect the call's service doesn't offer", async () => {
    const dock = noiseModels({
      rnnoise: off,
      gtcrn: off,
      krisp: { status: "unavailable", error: null },
    });
    const view = open(dock);
    expect(view.option("krisp")?.hidden).toBe(true);

    dock.api.setState((s) => ({
      ...s,
      local: {
        ...s.local,
        effects: { ...s.local.effects, krisp: off },
      },
    }));
    await settle();

    expect(view.option("krisp")?.hidden).toBe(false);
  });

  it("hides a group none of whose effects is available", () => {
    const unavailable: EffectState = { status: "unavailable", error: null };
    const dock = noiseModels({
      rnnoise: unavailable,
      gtcrn: unavailable,
      krisp: unavailable,
    });

    const view = open(dock);

    expect(view.select.closest<HTMLElement>(".mav-control")?.hidden).toBe(true);
  });

  it("keeps a model that failed chosen, and says why", () => {
    const view = open(
      noiseModels({
        rnnoise: { status: "failed", error: "StalledError" },
        gtcrn: off,
        krisp: off,
      }),
    );

    expect(view.select.value).toBe("rnnoise");
    expect(view.text()).toContain("Failed: it stopped sending sound");
  });

  it("names a failure it has no words for plainly", () => {
    const view = open(
      noiseModels({
        rnnoise: { status: "failed", error: "SomethingNew" },
        gtcrn: off,
        krisp: off,
      }),
    );

    expect(view.text()).toContain("Failed · Light");
  });

  it("warns that a heavier model may crackle on a slower computer", () => {
    const view = open(
      noiseModels({
        rnnoise: off,
        gtcrn: { status: "running", error: null },
        krisp: off,
      }),
    );

    expect(view.text()).toContain("On · Medium");
    expect(view.hint()?.hidden).toBe(false);
    expect(view.hint()?.textContent).toContain(
      "may crackle on a slower computer",
    );
  });

  it("doesn't warn about a light one", () => {
    const view = open(
      noiseModels({
        rnnoise: { status: "running", error: null },
        gtcrn: off,
        krisp: off,
      }),
    );

    expect(view.hint()?.hidden).toBe(true);
  });
});

describe("the camera background choice", () => {
  const background = (id: string): VideoEffectDefinition => ({
    id,
    kind: "video",
    label: id,
    exclusiveGroup: "camera-background",
    cost: "medium",
    isSupported: () => true,
    create: () => Promise.reject(new Error("unused")),
  });

  function openBackground(effects: Readonly<Record<string, EffectState>>) {
    const dock = testDock({
      state: avState({ participants: [me], local: { effects } }),
    });
    dock.api.effects.register(background("background-blur"));
    dock.api.effects.register(background("background-replace"));
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const popover = openQuickControls(dock.ctx, anchor);
    const select = popover.element.querySelector<HTMLSelectElement>(
      '[data-effect-group="camera-background"]',
    );
    const control = select?.closest(".mav-control");
    return { select, control, text: () => popover.element.textContent };
  }

  it("is named, and doesn't warn about crackling sound", () => {
    const view = openBackground({
      "background-blur": { status: "running", error: null },
      "background-replace": off,
    });

    expect(view.control?.querySelector("label")?.textContent).toBe(
      "Camera background",
    );
    expect(
      view.control?.querySelector<HTMLElement>(".mav-settings-hint")?.hidden,
    ).toBe(true);
  });

  it.each([
    ["ImageLoadError", "its image couldn't load"],
    ["ModelFileError", "its files couldn't load"],
    ["WorkerError", "it stopped working"],
    ["ContextLostError", "the graphics card stopped it"],
    ["WebGLUnavailableError", "this browser can't draw it"],
  ])("says why it failed: %s", (error, words) => {
    const view = openBackground({
      "background-blur": off,
      "background-replace": { status: "failed", error },
    });

    expect(view.text()).toContain(`Failed: ${words}`);
  });
});
