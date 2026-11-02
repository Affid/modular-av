// @vitest-environment happy-dom
import { participantState } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import { createGmLayers } from "../src/layers/gm-layers.ts";
import type { Layers, LayerStatus } from "../src/layers/layers.ts";
import type { Snapshot } from "../src/model/snapshot.ts";
import { parseReport } from "../src/table/report.ts";
import { renderLayerBar } from "../src/window/layer-bar.ts";
import { renderMixer } from "../src/window/view.ts";
import { act } from "./act.ts";
import { effect, testMixer } from "./context.ts";

const reverb = effect("reverb", "send", { tail: 3 });
const echo = effect("echo", "send");

interface Spies {
  readonly spies: Readonly<Record<string, ReturnType<typeof vi.fn>>>;
}

function fakeLayers(
  states: readonly LayerStatus[],
  held: Snapshot | null = null,
): Layers & Spies {
  let keptOut = false;
  const refuse = vi.fn(() => Promise.resolve());
  const accept = vi.fn(() => Promise.resolve());
  const setKeptOut = vi.fn((out: boolean) => {
    keptOut = out;
    return Promise.resolve();
  });
  return {
    spies: { refuse, accept, setKeptOut },
    reconcile: () => Promise.resolve(),
    refuse,
    accept,
    keptOut: () => keptOut,
    setKeptOut,
    states: () => states,
    held: () => held,
    takeHeld: (s) => Promise.resolve(s),
    free: (s) => s,
    underneath: (s) => s,
    subscribe: () => () => undefined,
  };
}

function open(layers: Layers) {
  const mixer = testMixer({
    effects: [reverb, echo],
    local: {
      chosenEffects: ["reverb"],
      audioEffectMix: { reverb: 0.3, echo: 0.2 },
    },
  });
  const view = renderMixer({ ...mixer.ctx, layers }, document);
  document.body.replaceChildren(view.element);
  const input = (selector: string) => {
    const found = view.element.querySelector<HTMLInputElement>(selector);
    if (!found) throw new Error(`no ${selector}`);
    return found;
  };
  return { ...mixer, view, input };
}

const cave: LayerStatus = { id: "cave", label: "Cave <b>", state: "applied" };

describe("a layer in the player's window", () => {
  it("says what the GM did, as text, and offers to refuse it", async () => {
    // Arrange
    const layers = fakeLayers([cave]);
    const { view, input } = open(layers);

    // Act
    input('[data-field="refuse.cave"]').click();
    await act();

    // Assert
    expect(view.element.textContent).toContain("Cave <b>");
    expect(view.element.querySelector("b")).toBeNull();
    expect(layers.spies.refuse).toHaveBeenCalledWith("cave");
  });

  it("offers a refused one back", async () => {
    const layers = fakeLayers([{ ...cave, state: "refused" }]);
    const { input } = open(layers);

    input('[data-field="accept.cave"]').click();
    await act();

    expect(layers.spies.accept).toHaveBeenCalledWith("cave");
  });

  it("has no banner with no layer", () => {
    const { view } = open(fakeLayers([]));

    expect(view.element.querySelector("[data-layer]")).toBeNull();
  });

  it("always offers to keep the GM out", async () => {
    const layers = fakeLayers([]);
    const { input } = open(layers);

    input('[data-field="keptOut"]').click();
    await act();

    expect(layers.spies.setKeptOut).toHaveBeenCalledWith(true);
  });

  it("locks what the layer holds, and says who set it", () => {
    // Arrange, Act
    const { input, view } = open(
      fakeLayers([cave], {
        effects: { reverb: { on: false, place: "send", mix: 0.3 } },
      }),
    );

    // Assert
    expect(input('[data-field="on.reverb"]').disabled).toBe(true);
    expect(input('[data-field="place.reverb"]').disabled).toBe(true);
    expect(input('[data-field="mix.reverb"]').disabled).toBe(true);
    expect(
      view.element.querySelector('[data-effect="reverb"]')?.textContent,
    ).toContain("Set by the GM");
    expect(input('[data-field="on.echo"]').disabled).toBe(false);
    expect(input('[data-field="mix.echo"]').disabled).toBe(false);
  });

  it("locks Channel level and an order while held", () => {
    const { input } = open(
      fakeLayers([cave], {
        effects: {},
        order: { send: ["reverb", "echo"] },
        channelLevel: 1,
      }),
    );

    expect(input('[data-field="channel"]').disabled).toBe(true);
    expect(input('[data-field="down.reverb"]').disabled).toBe(true);
  });
});

describe("a GM's layer controls", () => {
  function bar() {
    const written = { table: "", personal: new Map<string, string | null>() };
    const gmLayers = createGmLayers({
      definitions: () => [reverb],
      newId: () => "new",
      store: {
        table: () => written.table,
        setTable(json) {
          written.table = json;
          return Promise.resolve();
        },
        personal: (user) => written.personal.get(user) ?? "",
        setPersonal(user, json) {
          written.personal.set(user, json);
          return Promise.resolve();
        },
      },
    });
    const mixer = testMixer({
      effects: [reverb],
      isGM: true,
      presets: {
        a: JSON.stringify({
          name: "Cave",
          effects: { reverb: { on: true, place: "send", mix: 0.5 } },
        }),
      },
    });
    mixer.api.setState((state) => ({
      ...state,
      participants: {
        me: participantState({ id: "me", name: "Me", isLocal: true }),
        p1: participantState({ id: "p1", name: "Ann" }),
      },
    }));
    const view = renderLayerBar({ ...mixer.ctx, gmLayers }, document, gmLayers);
    document.body.replaceChildren(view.element);
    const q = (selector: string) => {
      const found = view.element.querySelector<HTMLInputElement>(selector);
      if (!found) throw new Error(`no ${selector}`);
      return found;
    };
    return { ...mixer, view, q, written };
  }

  it("lays a preset over the whole table", async () => {
    const { q, written } = bar();

    q('[data-field="layerApply"]').click();
    await act();

    expect(JSON.parse(written.table)).toMatchObject({
      label: "Cave",
      includeGMs: false,
    });
  });

  it("includes GMs when asked", async () => {
    const { q, written } = bar();

    q('[data-field="layerGMs"]').click();
    q('[data-field="layerApply"]').click();
    await act();

    expect(JSON.parse(written.table)).toMatchObject({ includeGMs: true });
  });

  it("can pick one player", async () => {
    const { q, written } = bar();

    q('[data-field="layerTarget"]').value = "p1";
    q('[data-field="layerApply"]').click();
    await act();

    expect(written.table).toBe("");
    expect(written.personal.get("p1")).toContain("Cave");
  });

  it("lists what is on, and ends it", async () => {
    // Arrange
    const { q, view, written } = bar();
    q('[data-field="layerApply"]').click();
    await act();
    expect(view.element.textContent).toContain("Cave");

    // Act
    q('[data-field="layerEnd.table"]').click();
    await act();

    // Assert
    expect(written.table).toBe("");
    expect(
      view.element.querySelector('[data-field="layerEnd.table"]'),
    ).toBeNull();
  });

  it("says a GM needs a preset first", () => {
    const mixer = testMixer({ effects: [reverb], isGM: true });
    const gmLayers = createGmLayers({
      definitions: () => [reverb],
      newId: () => "new",
      store: {
        table: () => "",
        setTable: () => Promise.resolve(),
        personal: () => "",
        setPersonal: () => Promise.resolve(),
      },
    });

    const view = renderLayerBar(mixer.ctx, document, gmLayers);

    expect(
      view.element.querySelector<HTMLButtonElement>('[data-field="layerApply"]')
        ?.disabled,
    ).toBe(true);
  });
});

describe("a report with layers", () => {
  const report = {
    snapshot: { effects: {} },
    status: {},
    warnings: [],
    layers: [{ id: "cave", label: "Cave", state: "refused" }],
  };

  it("is read", () => {
    expect(parseReport(report)?.layers).toEqual(report.layers);
  });

  it.each([
    ["an unknown state", [{ id: "a", label: "A", state: "great" }]],
    ["no label", [{ id: "a", state: "applied" }]],
    ["not a list", "cave"],
    [
      "too long a label",
      [{ id: "a", label: "x".repeat(200), state: "applied" }],
    ],
  ])("is refused with %s", (_, layers) => {
    expect(parseReport({ ...report, layers })).toBeNull();
  });
});
