// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
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
  it("says effects are modules of their own when there is nothing to mix", () => {
    const { view } = open();

    expect(view.element.textContent).toContain("modules of their own");
    expect(view.element.querySelector('[data-part="gate"]')).toBeNull();
  });

  it("shows warnings and failures below the chain, so nothing above moves", () => {
    // Arrange
    const { q } = open({ effects: [reverb] });
    const chain = q(".mav-mixer-chain");
    const below = (other: HTMLElement): boolean =>
      (chain.compareDocumentPosition(other) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;

    // Assert
    expect(below(q(".mav-mixer-warnings"))).toBe(true);
    expect(below(q(".mav-mixer-alert"))).toBe(true);
  });

  it("warns, naming the effect, without blocking anything", async () => {
    // Arrange
    const { view, q, setLocal, api } = open({ effects: [reverb] });
    expect(view.element.querySelector("[data-warning]")).toBeNull();

    // Act
    await setLocal({
      chosenEffects: ["reverb"],
      audioEffectPlaces: { reverb: "pre-gate" },
    });

    // Assert
    expect(q('[data-warning="tail-before-gate"]').textContent).toContain(
      "REVERB",
    );
    expect(api.calls).toEqual([]);
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
    const { view, setLocal } = open({
      effects: [denoise, eq],
      local: { chosenEffects: ["denoise", "eq"] },
    });
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
