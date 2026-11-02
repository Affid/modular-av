// @vitest-environment happy-dom
import { participantState } from "@modular-av/testing";
import type { ControlContribution, Observable } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import type { GmLayers } from "../src/layers/gm-layers.ts";
import type { Layer } from "../src/layers/layer.ts";
import type { Report } from "../src/table/report.ts";
import type { Table } from "../src/table/table.ts";
import { renderTableView } from "../src/window/table-view.ts";
import { renderMixer } from "../src/window/view.ts";
import { act } from "./act.ts";
import { effect, testMixer } from "./context.ts";

const reverb = effect("reverb", "send", { tail: 3 });
const denoise = effect("denoise", "pre-gate");
const radio = effect("radio", "post-gate");

function fakeTable(reports: Readonly<Record<string, Report>> = {}) {
  let listeners: readonly (() => void)[] = [];
  const stop = vi.fn();
  const watch = vi.fn(() => stop);
  const table: Table = {
    receive: () => undefined,
    watch,
    reportOf: (id) => reports[id],
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
  return {
    table,
    stop,
    watch,
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
}

const report: Report = {
  snapshot: {
    effects: {
      denoise: { on: true, place: "pre-gate" },
      radio: { on: false, place: "post-gate" },
      reverb: { on: true, place: "send", mix: 0.3 },
    },
    order: { "pre-gate": ["denoise"], send: ["reverb"] },
    channelLevel: 1,
  },
  status: { denoise: "running", reverb: "failed" },
  warnings: [{ key: "tail-before-gate", effect: "reverb" }],
  layers: [{ id: "cave", label: "Cave", state: "refused" }],
};

interface Extra {
  readonly controls?: readonly ControlContribution[];
  readonly gmLayers?: GmLayers;
}

function open(
  reports: Readonly<Record<string, Report>> = {},
  extra: Extra = {},
) {
  const mixer = testMixer({
    effects: [denoise, radio, reverb],
    controls: extra.controls ?? [],
  });
  mixer.api.setState((state) => ({
    ...state,
    participants: {
      me: participantState({ id: "me", name: "Me", isLocal: true }),
      p1: participantState({ id: "p1", name: "Ann <b>" }),
      p2: participantState({ id: "p2", name: "Bo" }),
      p3: participantState({ id: "p3", name: "Cy", active: false }),
    },
  }));
  const fake = fakeTable(reports);
  const ctx = extra.gmLayers
    ? { ...mixer.ctx, gmLayers: extra.gmLayers }
    : mixer.ctx;
  const view = renderTableView(ctx, document, fake.table);
  document.body.replaceChildren(view.element);
  return { ...mixer, ...fake, view };
}

const pick = (root: HTMLElement, id: string): HTMLElement => {
  const picker = root.querySelector<HTMLSelectElement>('[data-field="player"]');
  if (!picker) throw new Error("no player picker");
  picker.value = id;
  picker.dispatchEvent(new Event("change"));
  const shown = root.querySelector<HTMLElement>(`[data-player="${id}"]`);
  if (!shown) throw new Error(`${id} isn't shown`);
  return shown;
};

const keysIn = (root: HTMLElement, place: string) =>
  [
    ...root.querySelectorAll<HTMLElement>(`[data-part="${place}"] [data-key]`),
  ].map((card) => card.dataset.key);

describe("the GM's table", () => {
  it("is drawn with the window's own styles", () => {
    const { view } = open({ p1: report });

    expect(view.element.classList.contains("mav-mixer")).toBe(true);
  });

  it("asks while shown, and stops when closed", () => {
    const { watch, stop, view } = open();

    expect(watch).toHaveBeenCalledOnce();
    view.dispose();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("offers each other player, names as text, the first picked", () => {
    const { view } = open();

    const names = [
      ...view.element.querySelectorAll('[data-field="player"] option'),
    ].map((option) => option.textContent);

    expect(names).toEqual(["Ann <b>", "Bo", "Cy"]);
    expect(view.element.querySelector("option b")).toBeNull();
    expect(view.element.querySelector('[data-player="p1"]')).not.toBeNull();
  });

  it("shows the picked player's chain as cards and faders, read only", () => {
    const { view } = open({ p1: report });

    const shown = pick(view.element, "p1");

    expect(keysIn(shown, "pre-gate")).toEqual(["denoise"]);
    expect(keysIn(shown, "post-gate")).toEqual([]);
    expect(keysIn(shown, "send")).toEqual(["reverb"]);
    expect(
      shown.querySelector('[data-field="level.reverb"]')?.textContent,
    ).toBe("30%");
    expect(shown.querySelector('[data-field^="add."]')).toBeNull();
    // Only what opens their settings, to read.
    expect(
      [...shown.querySelectorAll<HTMLInputElement>("input, button")]
        .filter((control) => !control.dataset.field?.startsWith("settings."))
        .every((control) => control.disabled),
    ).toBe(true);
  });

  it("says when an effect failed there", () => {
    const { view } = open({ p1: report });

    const shown = pick(view.element, "p1");

    expect(
      shown.querySelector<HTMLElement>('[data-key="reverb"]')?.dataset.state,
    ).toBe("failed");
  });

  it("shows the same warnings the player sees, and how a layer went", () => {
    const { view } = open({ p1: report });

    const shown = pick(view.element, "p1");

    expect(shown.textContent).toContain(
      "REVERB rings on ahead of the voice gate",
    );
    expect(shown.textContent).toContain("Cave: refused");
  });

  it("shows a player's warnings below their chain, as they see them", () => {
    const { view } = open({ p1: report });

    const shown = pick(view.element, "p1");
    const warnings = shown.querySelector(".mav-mixer-warnings");
    const levels = shown.querySelector(".mav-mixer-levels");

    expect(warnings && levels?.nextElementSibling === warnings).toBe(true);
  });

  it("says who hasn't answered, and who isn't logged in", () => {
    const { view } = open();

    expect(pick(view.element, "p2").textContent).toContain("Waiting");
    expect(pick(view.element, "p3").textContent).toContain("Not logged in");
  });

  it("names an effect this client doesn't know by its id", () => {
    const gone: Report = {
      ...report,
      snapshot: { effects: { krisp: { on: true, place: "pre-gate" } } },
      status: {},
      warnings: [],
    };

    const { view } = open({ p1: gone });

    expect(pick(view.element, "p1").textContent).toContain("krisp");
  });

  it("follows new reports until closed, keeping the player picked", () => {
    // Arrange
    const reports: Record<string, Report> = {};
    const { view, notify } = open(reports);
    pick(view.element, "p2");
    reports.p2 = report;

    // Act
    notify();

    // Assert
    const shown = view.element.querySelector<HTMLElement>('[data-player="p2"]');
    expect(shown && keysIn(shown, "send")).toEqual(["reverb"]);
    view.dispose();
  });

  it("redraws nothing for a report that changes nothing shown", () => {
    const { view, notify } = open({ p1: report });
    const before = view.element.querySelector('[data-player="p1"]');

    notify();

    expect(view.element.querySelector('[data-player="p1"]')).toBe(before);
  });

  it("follows who is logged in", async () => {
    const { view, api } = open();
    pick(view.element, "p3");

    api.setState((state) => ({
      ...state,
      participants: {
        ...state.participants,
        p3: participantState({ id: "p3", name: "Cy" }),
      },
    }));
    await act();

    expect(
      view.element.querySelector('[data-player="p3"]')?.textContent,
    ).not.toContain("Not logged in");
  });
});

describe("the window's tabs", () => {
  const openWindow = (isGM: boolean) => {
    const mixer = testMixer({ effects: [reverb], isGM });
    const fake = fakeTable();
    const view = renderMixer(
      isGM ? { ...mixer.ctx, table: fake.table } : mixer.ctx,
      document,
    );
    return { ...fake, view };
  };

  it("are only a GM's", () => {
    expect(
      openWindow(false).view.element.querySelector('[role="tablist"]'),
    ).toBeNull();
    expect(
      openWindow(true).view.element.querySelector('[role="tablist"]'),
    ).not.toBeNull();
  });

  it("ask players only while the Table tab shows", () => {
    // Arrange
    const { view, watch, stop } = openWindow(true);
    const tab = view.element.querySelector<HTMLElement>('[data-tab="table"]');
    expect(watch).not.toHaveBeenCalled();

    // Act
    tab?.click();

    // Assert
    expect(watch).toHaveBeenCalledOnce();
    expect(tab?.getAttribute("aria-selected")).toBe("true");
    view.element.querySelector<HTMLElement>('[data-tab="mine"]')?.click();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("keep the GM's own channel in the page under the Table, so its meter lives on", () => {
    // Arrange: a meter stops for good once its element leaves the page.
    const { view } = openWindow(true);
    document.body.replaceChildren(view.element);
    const gate = view.element.querySelector<HTMLElement>('[data-part="gate"]');
    const mine = gate?.closest<HTMLElement>(".mav-mixer");
    const tab = (name: string) =>
      view.element.querySelector<HTMLElement>(`[data-tab="${name}"]`);

    // Act
    tab("table")?.click();

    // Assert: hidden, never removed.
    expect(gate?.isConnected).toBe(true);
    expect(mine?.hidden).toBe(true);
    tab("mine")?.click();
    expect(mine?.hidden).toBe(false);
    expect(view.element.querySelectorAll(".mav-mixer-view")).toHaveLength(0);
  });

  it("can open on the Table", () => {
    const { view, watch } = openWindow(true);

    view.show?.("table");

    expect(watch).toHaveBeenCalledOnce();
    expect(
      view.element
        .querySelector('[data-tab="table"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("stop asking when the window closes on the Table", () => {
    const { view, stop } = openWindow(true);
    view.show?.("table");

    view.dispose();

    expect(stop).toHaveBeenCalledOnce();
  });

  it("do nothing once the window has closed", () => {
    // Arrange
    const { view, watch } = openWindow(true);
    view.dispose();

    // Act: a stale reference to the closed window.
    view.show?.("table");

    // Assert
    expect(watch).not.toHaveBeenCalled();
  });
});

const fixed = <T>(value: T): Observable<T> => ({
  get: () => value,
  subscribe: () => () => undefined,
});

const decay = {
  kind: "control",
  place: "quick",
  effect: "reverb",
  type: "range",
  id: "decay",
  label: "Decay",
  unit: "s",
  min: 0.3,
  max: 3,
  step: 0.1,
  state: fixed(1.5),
  set: vi.fn(() => Promise.resolve()),
} as unknown as ControlContribution;

const bright = {
  kind: "control",
  place: "quick",
  effect: "reverb",
  type: "toggle",
  id: "bright",
  label: "Bright",
  state: fixed({ on: false }),
  set: vi.fn(() => Promise.resolve()),
} as unknown as ControlContribution;

const withSettings = (decayS: number): Report => ({
  ...report,
  snapshot: {
    ...report.snapshot,
    effects: {
      ...report.snapshot.effects,
      reverb: {
        on: true,
        place: "send",
        mix: 0.3,
        settings: { decay: decayS, bright: true },
      },
    },
  },
});

describe("a player's settings, from the GM's table", () => {
  const settingsOf = (shown: HTMLElement): HTMLElement => {
    const button = shown.querySelector<HTMLElement>(
      '[data-field="settings.reverb"]',
    );
    if (!button) throw new Error("no settings button");
    button.click();
    const pop = shown.querySelector<HTMLElement>('[data-pop="settings"]');
    if (!pop) throw new Error("no settings pop-up");
    return pop;
  };

  it("open from the card, as text, with nothing to change", () => {
    const { view } = open(
      { p1: withSettings(2.5) },
      { controls: [decay, bright] },
    );

    const pop = settingsOf(pick(view.element, "p1"));

    expect(pop.textContent).toContain("Decay");
    expect(pop.textContent).toContain("2.5 s");
    expect(pop.textContent).toContain("Bright");
    expect(pop.textContent).toContain("On");
    expect(pop.textContent).toContain("Sends");
    expect(pop.querySelectorAll("input, select")).toHaveLength(0);
    expect(
      [...pop.querySelectorAll<HTMLElement>("button")].map((b) => b.className),
    ).toEqual(["mav-mixer-pop-close"]);
  });

  it("open with Enter on a card", () => {
    const { view } = open({ p1: withSettings(2.5) }, { controls: [decay] });
    const shown = pick(view.element, "p1");
    const card = shown.querySelector<HTMLElement>('[data-key="reverb"]');

    card?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(shown.querySelector('[data-pop="settings"]')).not.toBeNull();
  });

  it("stay open as their report comes, showing what it says", () => {
    // Arrange
    const reports: Record<string, Report> = { p1: withSettings(2.5) };
    const { view, notify } = open(reports, { controls: [decay] });
    settingsOf(pick(view.element, "p1"));

    // Act
    reports.p1 = withSettings(1);
    notify();

    // Assert
    const pop = view.element.querySelector('[data-pop="settings"]');
    expect(pop?.textContent).toContain("1 s");
    expect(pop?.textContent).not.toContain("2.5 s");
  });

  it("keeps where their places were scrolled to as their report comes", () => {
    const reports: Record<string, Report> = { p1: withSettings(2.5) };
    const { view, notify } = open(reports);
    const rack = () =>
      view.element.querySelector<HTMLElement>('[data-rack="send"]');
    pick(view.element, "p1");
    const before = rack();
    if (before) before.scrollTop = 12;

    reports.p1 = withSettings(1);
    notify();

    expect(rack()?.scrollTop).toBe(12);
  });
});

const caveLayer: Layer = {
  id: "cave",
  label: "Cave",
  includeGMs: false,
  effects: { reverb: { on: true, mix: 0.6 } },
};

const gmLayersWith = (table: Layer | null): GmLayers => ({
  applyPreset: () => Promise.resolve(),
  set: () => Promise.resolve(),
  end: () => Promise.resolve(),
  tableLayer: () => table,
  personalLayer: () => null,
});

const inCave = (state: "applied" | "refused", id = "cave"): Report => ({
  ...report,
  layers: [{ id, label: "Cave", state }],
});

describe("a GM's own layers, on a player's chain", () => {
  const reverbCard = (r: Report): HTMLElement | null => {
    const { view } = open({ p1: r }, { gmLayers: gmLayersWith(caveLayer) });
    return pick(view.element, "p1").querySelector('[data-key="reverb"]');
  };

  it("mark the cards they hold there, naming the layer", () => {
    const card = reverbCard(inCave("applied"));

    expect(card?.dataset.held).toBe("");
    expect(card?.textContent).toContain("GM: Cave");
  });

  it("mark nothing the player refused", () => {
    expect(reverbCard(inCave("refused"))?.dataset.held).toBeUndefined();
  });

  it("mark nothing for a layer that has since ended or changed", () => {
    expect(reverbCard(inCave("applied", "old"))?.dataset.held).toBeUndefined();
  });

  it("say how they went after the chain, so it doesn't move", () => {
    const { view } = open({ p1: inCave("refused") });
    const shown = pick(view.element, "p1");

    expect(shown.lastElementChild?.textContent).toContain("Cave: refused");
  });
});

describe("another player picked", () => {
  it("starts at the top of their chain, with nothing open", () => {
    // Arrange
    const { view } = open(
      { p1: withSettings(2.5), p2: withSettings(2.5) },
      { controls: [decay] },
    );
    const first = pick(view.element, "p1");
    const rack = first.querySelector<HTMLElement>('[data-rack="send"]');
    if (rack) rack.scrollTop = 12;
    first.querySelector<HTMLElement>('[data-field="settings.reverb"]')?.click();

    // Act
    const second = pick(view.element, "p2");

    // Assert
    expect(
      second.querySelector<HTMLElement>('[data-rack="send"]')?.scrollTop,
    ).toBe(0);
    expect(view.element.querySelector('[data-pop="settings"]')).toBeNull();
  });
});
