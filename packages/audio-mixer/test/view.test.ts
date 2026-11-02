// @vitest-environment happy-dom
import type { ControlContribution, Observable } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import { renderMixer } from "../src/window/view.ts";
import { act } from "./act.ts";
import { effect, type Setup, testMixer } from "./context.ts";

const denoise = effect("denoise", "pre-gate", {
  exclusiveGroup: "noise-suppression",
});
const eq = effect("eq", "pre-gate", { cost: "light" });
const reverb = effect("reverb", "send", { tail: 3 });

function open(setup: Setup = {}) {
  const mixer = testMixer(setup);
  const view = renderMixer(mixer.ctx, document);
  document.body.replaceChildren(view.element);
  const q = (selector: string): HTMLElement => {
    const found = view.element.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`no ${selector}`);
    return found;
  };
  const input = (selector: string) => q(selector) as HTMLInputElement;
  return { ...mixer, view, q, input };
}

const fixed = <T>(value: T): Observable<T> => ({
  get: () => value,
  subscribe: () => () => undefined,
});

const change = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
  input.value = value;
  input.dispatchEvent(
    new Event(input instanceof HTMLSelectElement ? "change" : "input"),
  );
};

const rows = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("[data-effect]")].map(
    (r) => r.dataset.effect,
  );

describe("the mixer window", () => {
  it("lays out the channel: pre-gate, the gate, post-gate, then sends", () => {
    const { view } = open({ effects: [reverb, eq, denoise] });

    const parts = [
      ...view.element.querySelectorAll<HTMLElement>("[data-part]"),
    ];

    expect(parts.map((p) => p.dataset.part)).toEqual([
      "pre-gate",
      "gate",
      "post-gate",
      "channel",
      "send",
    ]);
    expect(rows(view.element)).toEqual(["denoise", "eq", "reverb"]);
  });

  it("says effects are modules of their own when there is nothing to mix", () => {
    const { view } = open();

    expect(view.element.textContent).toContain("modules of their own");
    expect(view.element.querySelector('[data-part="gate"]')).toBeNull();
  });

  it("shows a contributed label as text, never as markup", () => {
    const bad = effect("bad", "send", { label: "<img src=x>" });

    const { view } = open({ effects: [bad] });

    expect(view.element.querySelector("img")).toBeNull();
    expect(view.element.textContent).toContain("<img src=x>");
  });

  it("turns an effect on and off", async () => {
    const { api, input, setLocal } = open({ effects: [reverb] });

    input('[data-field="on.reverb"]').click();
    await act();
    await setLocal({ chosenEffects: ["reverb"] });
    input('[data-field="on.reverb"]').click();
    await act();

    expect(api.calls).toEqual([
      { command: "setEffectEnabled", args: ["reverb", true] },
      { command: "setEffectEnabled", args: ["reverb", false] },
    ]);
  });

  it("can't turn on what this browser can't run", () => {
    const { input } = open({
      effects: [reverb],
      local: { effects: { reverb: { status: "unsupported", error: null } } },
    });

    expect(input('[data-field="on.reverb"]').disabled).toBe(true);
  });

  it("says how a chosen effect is doing", () => {
    const failed = open({
      effects: [reverb],
      local: {
        chosenEffects: ["reverb"],
        effects: { reverb: { status: "failed", error: "KernelError" } },
      },
    });
    expect(failed.q("[data-status]").textContent).toContain("Failed");

    const waiting = open({
      effects: [reverb],
      local: {
        chosenEffects: ["reverb"],
        effects: { reverb: { status: "off", error: null } },
      },
    });
    expect(waiting.q("[data-status]").textContent).toContain("microphone");
  });

  it("shows what an effect costs", () => {
    const { q } = open({ effects: [eq] });

    expect(q('[data-effect="eq"]').textContent).toContain("Light");
  });

  it("moves an effect up its lane, the whole lane in one change", async () => {
    const { api, q } = open({ effects: [denoise, eq] });

    q('[data-field="up.eq"]').click();
    await act();

    expect(api.calls).toEqual([
      {
        command: "setAudioPipeline",
        args: [{ order: { "pre-gate": ["eq", "denoise"] } }],
      },
    ]);
  });

  it("offers no move past the end of a lane", () => {
    const { input } = open({ effects: [denoise, eq] });

    expect(input('[data-field="up.denoise"]').disabled).toBe(true);
    expect(input('[data-field="down.eq"]').disabled).toBe(true);
    expect(input('[data-field="down.denoise"]').disabled).toBe(false);
  });

  it("moves an effect to another place", async () => {
    const { api, input } = open({ effects: [eq, reverb] });

    change(input('[data-field="place.reverb"]'), "post-gate");
    await act();

    expect(api.calls).toEqual([
      {
        command: "setAudioPipeline",
        args: [
          {
            places: { reverb: "post-gate" },
            order: { send: [], "post-gate": ["reverb"] },
          },
        ],
      },
    ]);
  });

  it("redraws when the core moves something, and keeps the keyboard's place", async () => {
    // Arrange
    const { q, view, setLocal } = open({ effects: [denoise, eq] });
    q('[data-field="up.eq"]').focus();

    // Act
    await setLocal({
      audioEffectOrder: {
        "pre-gate": ["eq", "denoise"],
        "post-gate": [],
        send: [],
      },
    });

    // Assert
    expect(rows(view.element)).toEqual(["eq", "denoise"]);
    expect(document.activeElement).toBe(q('[data-field="down.eq"]'));
  });

  it("sets a level while it is dragged, landing on the last value", async () => {
    // Arrange
    const { api, input } = open({
      effects: [reverb],
      local: { chosenEffects: ["reverb"], audioEffectMix: { reverb: 0.3 } },
    });
    const level = input('[data-field="mix.reverb"]');

    // Act
    change(level, "40");
    change(level, "50");
    change(level, "60");
    await act();

    // Assert
    const last = api.calls.at(-1);
    expect(last).toEqual({
      command: "setAudioEffectMix",
      args: ["reverb", 0.6],
    });
    expect(api.calls.length).toBeLessThan(3);
    expect(level.parentElement?.textContent).toContain("60%");
  });

  it("has no level for an effect the core can't mix", () => {
    const { view } = open({ effects: [eq] });

    expect(view.element.querySelector('[data-field="mix.eq"]')).toBeNull();
  });

  it("follows a level the core changes", async () => {
    const { input, setLocal } = open({
      effects: [reverb],
      local: { audioEffectMix: { reverb: 0.3 } },
    });
    const level = input('[data-field="mix.reverb"]');

    await setLocal({ audioEffectMix: { reverb: 0.8 } });

    expect(input('[data-field="mix.reverb"]')).toBe(level);
    expect(level.value).toBe("80");
  });

  it("sets Channel level, which only matters with a send", async () => {
    const { api, input } = open({ effects: [reverb] });

    change(input('[data-field="channel"]'), "40");
    await act();

    expect(api.calls).toEqual([
      { command: "setAudioChannelLevel", args: [0.4] },
    ]);
    expect(
      open({ effects: [eq] }).view.element.querySelector(
        '[data-field="channel"]',
      ),
    ).toBeNull();
  });

  it("shows an effect's own controls only while it is chosen", async () => {
    // Arrange
    const set = vi.fn(() => Promise.resolve());
    const decay: ControlContribution = {
      kind: "control",
      place: "quick",
      effect: "reverb",
      type: "range",
      id: "decay",
      label: "Decay",
      min: 0,
      max: 3,
      step: 0.1,
      unit: "s",
      state: fixed(1.5),
      set,
    };
    const { view, q, input, setLocal } = open({
      effects: [reverb],
      controls: [decay],
    });
    expect(view.element.querySelector('[data-control="decay"]')).toBeNull();

    // Act
    await setLocal({ chosenEffects: ["reverb"] });
    expect(q('[data-control="decay"]').textContent).toContain("1.5 s");
    change(input('[data-control="decay"] input'), "2");
    await act();

    // Assert
    expect(set).toHaveBeenCalledWith(2);
  });

  it("draws toggles and choices, and leaves buttons out", async () => {
    // Arrange
    const toggleSet = vi.fn(() => Promise.resolve());
    const choiceSet = vi.fn(() => Promise.resolve());
    const attached = {
      kind: "control",
      place: "quick",
      effect: "reverb",
    } as const;
    const { view, input } = open({
      effects: [reverb],
      local: { chosenEffects: ["reverb"] },
      controls: [
        {
          ...attached,
          type: "toggle",
          id: "wide",
          label: "Wide",
          state: fixed({ on: false }),
          set: toggleSet,
        },
        {
          ...attached,
          type: "choice",
          id: "room",
          label: "Room",
          options: [
            { value: "hall", label: "Hall" },
            { value: "cave", label: "Cave" },
          ],
          state: fixed("hall"),
          set: choiceSet,
        },
        {
          ...attached,
          type: "button",
          id: "reset",
          label: "Reset",
          run: () => Promise.resolve(),
        },
      ],
    });

    // Act
    input('[data-control="wide"] input').click();
    change(input('[data-control="room"] select'), "cave");
    await act();

    // Assert
    expect(toggleSet).toHaveBeenCalledWith(true);
    expect(choiceSet).toHaveBeenCalledWith("cave");
    expect(view.element.querySelector('[data-control="reset"]')).toBeNull();
  });

  it("warns, naming the effect, without blocking anything", async () => {
    // Arrange
    const { view, q, input, setLocal, api } = open({ effects: [reverb] });
    expect(view.element.querySelector("[data-warning]")).toBeNull();

    // Act
    await setLocal({
      chosenEffects: ["reverb"],
      audioEffectPlaces: { reverb: "pre-gate" },
    });
    change(input('[data-field="place.reverb"]'), "send");
    await act();

    // Assert
    expect(q('[data-warning="tail-before-gate"]').textContent).toContain(
      "REVERB",
    );
    expect(api.calls).toHaveLength(1);
  });

  it("shows a change of status in place, so a drag elsewhere isn't lost", async () => {
    // Arrange
    const { view, q, setLocal } = open({
      effects: [reverb],
      local: {
        chosenEffects: ["reverb"],
        effects: { reverb: { status: "starting", error: null } },
      },
    });
    const row = q('[data-effect="reverb"]');

    // Act
    await setLocal({
      effects: { reverb: { status: "running", error: null } },
    });

    // Assert
    expect(view.element.querySelector('[data-effect="reverb"]')).toBe(row);
    expect(q("[data-status]").textContent).toBe("On");
  });

  it("sets Cut tails", async () => {
    const { api, q } = open({ effects: [reverb] });

    q('[data-field="cutTails"]').click();
    await act();

    expect(api.calls).toEqual([{ command: "setAudioCutTails", args: [true] }]);
  });

  it("tells the player when a write fails", async () => {
    // Arrange
    const { api, q, errors } = open({ effects: [reverb] });
    const boom = new Error("boom");
    api.failNext("setAudioCutTails", boom);

    // Act
    q('[data-field="cutTails"]').click();
    await act();

    // Assert
    expect(errors).toEqual([boom]);
    expect(q('[role="alert"]').textContent).toContain("boom");
  });

  it("stops following once closed", async () => {
    const { view, setLocal } = open({ effects: [denoise, eq] });
    const before = rows(view.element);

    view.dispose();
    await setLocal({
      audioEffectOrder: {
        "pre-gate": ["eq", "denoise"],
        "post-gate": [],
        send: [],
      },
    });

    expect(rows(view.element)).toEqual(before);
  });
});

describe("presets in the window", () => {
  const preset = (name: string) => JSON.stringify({ name, effects: {} });
  const cave = { a: preset("Cave"), b: preset("Radio") };

  it("lists them, shown as text", () => {
    const { input } = open({
      effects: [reverb],
      presets: { a: preset("<b>Cave</b>") },
    });

    const list = input('[data-field="preset"]');

    expect(list.textContent).toContain("<b>Cave</b>");
    expect(list.querySelector("b")).toBeNull();
  });

  it("applies the one picked", async () => {
    const { ctx, input } = open({ effects: [reverb], presets: cave });

    change(input('[data-field="preset"]'), "b");
    await act();

    expect(ctx.presets.active()?.name).toBe("Radio");
  });

  it("saves a new one from what is there, and shows it picked", async () => {
    // Arrange
    const { ctx, input, q } = open({ effects: [reverb] });
    input('[data-field="presetName"]').value = "Cave";

    // Act
    q('[data-field="presetSave"]').click();
    await act();

    // Assert
    expect(ctx.presets.list().map((p) => p.name)).toEqual(["Cave"]);
    expect(input('[data-field="preset"]').value).toBe("id1");
    expect(input('[data-field="presetName"]').value).toBe("");
  });

  it("says why a name won't do", async () => {
    const { q } = open({ effects: [reverb] });

    q('[data-field="presetSave"]').click();
    await act();

    expect(q('[role="alert"]').textContent).toContain("name");
  });

  it("says when the channel moved off the active one, and can save over it", async () => {
    // Arrange
    const { ctx, input, q, setLocal } = open({ effects: [reverb] });
    await ctx.presets.saveAs("Cave");
    await act();
    expect(q('[data-field="presetChanged"]').textContent).toBe("");
    expect(input('[data-field="presetUpdate"]').disabled).toBe(true);

    // Act
    await setLocal({ audioChannelLevel: 0.5 });
    q('[data-field="presetUpdate"]').click();
    await act();

    // Assert
    expect(ctx.presets.list()[0]?.channelLevel).toBe(0.5);
    expect(q('[data-field="presetChanged"]').textContent).toBe("");
  });

  it("deletes the active one only after asking", async () => {
    // Arrange
    const { ctx, q, confirm } = open({ effects: [reverb], presets: cave });
    await ctx.presets.apply("a");
    await act();
    confirm.answer = false;

    // Act: no, then yes.
    q('[data-field="presetDelete"]').click();
    await act();
    expect(ctx.presets.list()).toHaveLength(2);
    confirm.answer = true;
    q('[data-field="presetDelete"]').click();
    await act();

    // Assert
    expect(confirm.asked[0]).toContain("Cave");
    expect(ctx.presets.list().map((p) => p.name)).toEqual(["Radio"]);
  });

  it("has nothing to delete with none active", () => {
    const { input } = open({ effects: [reverb], presets: cave });

    expect(input('[data-field="presetDelete"]').disabled).toBe(true);
  });

  it("says what it had to skip", async () => {
    // Arrange
    const { ctx, q } = open({
      effects: [reverb],
      presets: {
        a: JSON.stringify({
          name: "Krisp",
          effects: { krisp: { on: true } },
        }),
      },
    });

    // Act
    await ctx.presets.apply("a");
    await act();

    // Assert
    expect(q('[data-field="presetSkipped"]').textContent).toContain("krisp");
  });

  it("stops listening once closed", async () => {
    const { ctx, view, input } = open({ effects: [reverb], presets: cave });
    const list = input('[data-field="preset"]');

    view.dispose();
    await ctx.presets.apply("a");
    await act();

    expect(list.value).not.toBe("a");
  });
});
