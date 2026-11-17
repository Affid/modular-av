// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS, createTable, type Tab } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Foundry's player list as `tab` renders it. */
function renderList(tab: Tab, ids: readonly string[]): HTMLElement {
  const list = document.createElement("ol");
  for (const id of ids) {
    const item = document.createElement("li");
    item.dataset.userId = id;
    list.append(item);
  }
  tab.client.Hooks.callAll("renderPlayers", {}, list);
  return list;
}

describe("the player list without a UI module", () => {
  it("marks the player whose browser has a module receiving voices", async () => {
    // Arrange
    const table = createTable({
      modules: [
        { id: "modular-av", version: "0.1.0" },
        { id: "transcriber", version: "1.0.0", title: "Transcriber" },
      ],
    });
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();

    // Act
    gm.api.media.audio("transcriber", "p1", "microphone", () => undefined);
    await table.settle();
    const list = renderList(p1, ["gm", "p1"]);

    // Assert
    const badge = list.querySelector<HTMLElement>(
      'li[data-user-id="gm"] .mav-badge[data-voice-copies]',
    );
    expect(badge?.getAttribute("aria-label")).toBe(
      "Modules here: Transcriber receives no one (not answered: you)",
    );
    expect(badge?.querySelector("i")?.className).toBe("fa-solid fa-ear-listen");
    expect(list.querySelector('li[data-user-id="p1"] .mav-badge')).toBeNull();
  });

  it("asks Foundry to draw the list again when a module starts or stops", async () => {
    const table = createTable({
      modules: [
        { id: "modular-av", version: "0.1.0" },
        { id: "transcriber", version: "1.0.0" },
      ],
    });
    const gm = table.join("gm", { secret: true, av: ALWAYS });
    const p1 = table.join("p1", { av: ALWAYS });
    await table.settle();
    const players = { render: vi.fn() };
    Object.assign(p1.client.ui, { players });

    const off = gm.api.media.audio(
      "transcriber",
      "p1",
      "microphone",
      () => undefined,
    );
    await table.settle();
    off();
    await table.settle();

    expect(players.render).toHaveBeenCalledTimes(2);
  });
});
