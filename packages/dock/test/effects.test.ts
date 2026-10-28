// @vitest-environment happy-dom
import type {
  AudioEffectDefinition,
  EffectCost,
  EffectState,
  VideoEffectDefinition,
} from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it } from "vitest";
import { renderEffects } from "../src/panel/effects.ts";
import { openCameraMenu, openMicMenu } from "../src/panel/device-menus.ts";
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

function open(dock: TestDock, group = "noise-suppression") {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  // The camera's effects are in its menu, the voice's in the microphone's.
  const menu = group === "camera-background" ? openCameraMenu : openMicMenu;
  const popover = menu(dock.ctx, anchor);
  const select = popover.element.querySelector<HTMLSelectElement>(
    `[data-effect-group="${group}"]`,
  );
  if (!select) throw new Error("no group");
  const root = select.closest<HTMLElement>(".mav-effect") ?? select;
  const option = (id: string): HTMLOptionElement | undefined =>
    [...select.options].find((o) => o.value === id);
  const hint = (): HTMLElement | null =>
    select
      .closest(".mav-control")
      ?.querySelector<HTMLElement>(".mav-settings-hint") ?? null;
  return {
    popover,
    root,
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

    // Running needs no words: the choice shows it.
    expect(view.text()).not.toContain("On · Medium");
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
    const popover = openCameraMenu(dock.ctx, anchor);
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

describe("an effect group of two, with what other modules attach", () => {
  const background = (id: string): VideoEffectDefinition => ({
    id,
    kind: "video",
    label: id,
    exclusiveGroup: "camera-background",
    cost: "medium",
    isSupported: () => true,
    create: () => Promise.reject(new Error("unused")),
  });

  function setup(effects: Readonly<Record<string, EffectState>>) {
    const dock = testDock({
      state: avState({ participants: [me], local: { effects } }),
    });
    dock.api.effects.register(background("background-blur"));
    dock.api.effects.register(background("background-replace"));
    dock.api.contributions.register({
      kind: "control",
      place: "quick",
      type: "button",
      id: "cam.pick",
      label: "Choose an image…",
      effect: "background-replace",
      run: () => Promise.resolve(),
    });
    return dock;
  }

  const pressed = (root: ParentNode) =>
    [...root.querySelectorAll('[data-effect][aria-pressed="true"]')].map(
      (b) => b.textContent,
    );

  it("is Off and each effect as buttons, which switch the call's effect", () => {
    const dock = setup({ "background-blur": off, "background-replace": off });
    const view = open(dock, "camera-background");

    view.root
      .querySelector<HTMLButtonElement>('[data-effect="background-blur"]')
      ?.click();

    expect(pressed(view.root)).toEqual(["Off"]);
    expect(dock.api.calls).toEqual([
      { command: "setEffectEnabled", args: ["background-blur", true] },
    ]);
  });

  it("shows an attached control only under its effect, while chosen", async () => {
    const dock = setup({ "background-blur": off, "background-replace": off });
    const view = open(dock, "camera-background");
    const pick = () => view.root.querySelector('[data-control="button"]');
    expect(pick()).toBeNull();

    dock.api.setState((s) => ({
      ...s,
      local: {
        ...s.local,
        effects: {
          "background-blur": off,
          "background-replace": { status: "running", error: null },
        },
      },
    }));
    await settle();

    expect(pressed(view.root)).toEqual(["background-replace"]);
    expect(pick()?.closest(".mav-effect")).not.toBeNull();
    // Nowhere else in the popover.
    expect(
      view.popover.element.querySelectorAll('[data-control="button"]'),
    ).toHaveLength(1);
  });

  it("keeps a draft's choice without touching the call", () => {
    const dock = setup({ "background-blur": off, "background-replace": off });
    let draft = "";
    const changed: (() => void)[] = [];
    const rendered = renderEffects(dock.ctx, document, null, {
      kind: "video",
      model: {
        chosen: () => draft,
        choose: (_group, id) => {
          draft = id;
          for (const listener of changed) listener();
        },
        subscribe: (listener) => {
          changed.push(listener);
          return () => undefined;
        },
      },
    });
    document.body.append(rendered.element);

    rendered.element
      .querySelector<HTMLButtonElement>('[data-effect="background-replace"]')
      ?.click();

    expect(draft).toBe("background-replace");
    expect(pressed(rendered.element)).toEqual(["background-replace"]);
    expect(dock.api.calls).toEqual([]);
    rendered.dispose();
  });
});
