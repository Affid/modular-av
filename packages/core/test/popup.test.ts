import type { PageWindow } from "@modular-av/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTable } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const SIZE = { width: 320, height: 480, title: "Cameras" };

async function tab() {
  const table = createTable();
  const p1 = table.join("p1", { noPip: true });
  await table.settle();
  return p1;
}

describe("the popup window", () => {
  it("opens a normal window of that size, prepared for its owner, even without Picture-in-Picture", async () => {
    // Arrange
    const p1 = await tab();
    const changes: (PageWindow | null)[] = [];
    p1.api.windows.popup.onChange((current) => changes.push(current));

    // Act
    const opened = await p1.api.windows.popup.request("modular-av-dock", SIZE);

    // Assert
    expect(p1.api.windows.popup.supported()).toBe(true);
    expect(p1.popups.requests).toEqual(["popup,width=320,height=480"]);
    expect(opened.owner).toBe("modular-av-dock");
    expect(opened.window).toBe(p1.popups.windows[0]);
    expect(opened.document.title).toBe("Cameras");
    expect(p1.prepared).toEqual([opened.window]);
    expect(p1.api.windows.popup.current).toBe(opened);
    expect(changes).toEqual([opened]);
  });

  it("tells its owner once when it closes, however it closes", async () => {
    const p1 = await tab();
    const opened = await p1.api.windows.popup.request("modular-av-dock", SIZE);
    const closed = vi.fn();
    opened.onClose(closed);

    p1.popups.closeByUser();
    opened.close();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(p1.api.windows.popup.current).toBeNull();
    expect(p1.undone).toEqual([opened.window]);
  });

  it("closes a window reloaded or sent elsewhere, so it isn't left blank", async () => {
    const p1 = await tab();
    const opened = await p1.api.windows.popup.request("modular-av-dock", SIZE);
    const closed = vi.fn();
    opened.onClose(closed);

    p1.popups.reloadByUser();

    expect(opened.window.closed).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(p1.api.windows.popup.current).toBeNull();
  });

  it("closes with the Foundry page, so it isn't left behind", async () => {
    const p1 = await tab();
    const opened = await p1.api.windows.popup.request("modular-av-dock", SIZE);

    p1.hidePage();

    expect(opened.window.closed).toBe(true);
    expect(p1.api.windows.popup.current).toBeNull();
    expect(p1.pageHideListeners()).toBe(0);
  });

  it("notices a window closed without telling (the browser's own close)", async () => {
    // Arrange
    const p1 = await tab();
    const opened = await p1.api.windows.popup.request("modular-av-dock", SIZE);
    const closed = vi.fn();
    opened.onClose(closed);

    // Act: closed, but no pagehide reached the core.
    Object.defineProperty(opened.window, "closed", { value: true });
    await vi.advanceTimersByTimeAsync(1500);

    // Assert
    expect(closed).toHaveBeenCalledTimes(1);
    expect(p1.api.windows.popup.current).toBeNull();
  });

  it("closes the window open for a new request, and leaves Picture-in-Picture alone", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();
    const pip = await p1.api.windows.pip.request("modular-av-dock", SIZE);
    const first = await p1.api.windows.popup.request("modular-av-dock", SIZE);

    const second = await p1.api.windows.popup.request(
      "modular-av-tokens",
      SIZE,
    );

    expect(first.window.closed).toBe(true);
    expect(p1.api.windows.popup.current).toBe(second);
    expect(p1.api.windows.pip.current).toBe(pip);
  });

  it("says a popup blocker refused it, and checks the request", async () => {
    const p1 = await tab();
    p1.popups.block(true);

    await expect(
      p1.api.windows.popup.request("modular-av-dock", SIZE),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      p1.api.windows.popup.request("modular-av-dock", { width: 0, height: 2 }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(p1.api.windows.popup.current).toBeNull();
  });
});
