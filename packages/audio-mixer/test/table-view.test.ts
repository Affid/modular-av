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

const rowOf = (root: HTMLElement, id: string) => {
  const row = root.querySelector<HTMLElement>(`[data-player="${id}"]`);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};

describe("the GM's table", () => {
  it("asks while shown, and stops when closed", () => {
    const { watch, stop, view } = open();

    expect(watch).toHaveBeenCalledOnce();
    view.dispose();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("shows each other player, names as text", () => {
    const { view } = open();

    const names = [...view.element.querySelectorAll("[data-player] th")].map(
      (th) => th.textContent,
    );

    expect(names).toEqual(["Ann <b>", "Bo", "Cy"]);
    expect(view.element.querySelector("td b, th b")).toBeNull();
  });

  it("shows what runs where, with sends' levels, read only", () => {
    const { view } = open({ p1: report });

    const row = rowOf(view.element, "p1");

    expect(row.querySelector('[data-place="pre-gate"]')?.textContent).toBe(
      "DENOISE",
    );
    expect(row.querySelector('[data-place="post-gate"]')?.textContent).toBe("");
    expect(row.querySelector('[data-place="send"]')?.textContent).toContain(
      "REVERB 30%",
    );
    expect(view.element.querySelector("input, select")).toBeNull();
  });

  it("says when an effect failed there", () => {
    const { view } = open({ p1: report });

    expect(rowOf(view.element, "p1").textContent).toContain("failed");
  });

  it("shows the same warnings the player sees", () => {
    const { view } = open({ p1: report });

    expect(rowOf(view.element, "p1").textContent).toContain(
      "REVERB rings on ahead of the voice gate",
    );
  });

  it("shows how a layer went", () => {
    const { view } = open({ p1: report });

    expect(rowOf(view.element, "p1").textContent).toContain("Cave: refused");
  });

  it("says who hasn't answered, and who isn't logged in", () => {
    const { view } = open();

    expect(rowOf(view.element, "p2").textContent).toContain("Waiting");
    expect(rowOf(view.element, "p3").textContent).toContain("Not logged in");
  });

  it("names an effect this client doesn't know by its id", () => {
    const gone: Report = {
      ...report,
      snapshot: { effects: { krisp: { on: true, place: "pre-gate" } } },
      status: {},
      warnings: [],
    };

    const { view } = open({ p1: gone });

    expect(rowOf(view.element, "p1").textContent).toContain("krisp");
  });

  it("follows new reports until closed", () => {
    // Arrange
    const reports: Record<string, Report> = {};
    const { view, notify } = open(reports);
    reports.p2 = report;

    // Act
    notify();

    // Assert
    expect(rowOf(view.element, "p2").textContent).toContain("REVERB");
    view.dispose();
  });

  it("follows who is logged in", async () => {
    const { view, api } = open();

    api.setState((state) => ({
      ...state,
      participants: {
        ...state.participants,
        p3: participantState({ id: "p3", name: "Cy" }),
      },
    }));
    await act();

    expect(rowOf(view.element, "p3").textContent).not.toContain(
      "Not logged in",
    );
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
});
