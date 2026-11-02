// @vitest-environment happy-dom
import { participantState } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
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

function open(reports: Readonly<Record<string, Report>> = {}) {
  const mixer = testMixer({ effects: [denoise, radio, reverb] });
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
  const view = renderTableView(mixer.ctx, document, fake.table);
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
    expect(shown.querySelector('[data-field^="settings."]')).toBeNull();
    expect(
      [...shown.querySelectorAll<HTMLInputElement>("input, button")].every(
        (control) => control.disabled,
      ),
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
