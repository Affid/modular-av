import type { PipWindow } from "@modular-av/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTable } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const SIZE = { width: 320, height: 480, title: "Cameras" };

async function tab(options: { readonly noPip?: boolean } = {}) {
  const table = createTable();
  const p1 = table.join("p1", options);
  await table.settle();
  return p1;
}

describe("the Picture-in-Picture window", () => {
  it("opens prepared for its owner, and says so", async () => {
    // Arrange
    const p1 = await tab();
    const changes: (PipWindow | null)[] = [];
    p1.api.windows.pip.onChange((current) => changes.push(current));

    // Act
    const opened = await p1.api.windows.pip.request("modular-av-dock", SIZE);

    // Assert
    expect(p1.api.windows.pip.supported()).toBe(true);
    expect(p1.pip.requests).toEqual([{ width: 320, height: 480 }]);
    expect(opened.owner).toBe("modular-av-dock");
    expect(opened.window).toBe(p1.pip.window);
    expect(opened.document).toBe(p1.pip.window?.document);
    expect(p1.pipPrepared).toEqual([opened.window]);
    expect(p1.api.windows.pip.current).toBe(opened);
    expect(changes).toEqual([opened]);
  });

  it("tells its owner once when it closes, however it closes", async () => {
    const p1 = await tab();
    const opened = await p1.api.windows.pip.request("modular-av-dock", SIZE);
    const closed = vi.fn();
    opened.onClose(closed);

    p1.pip.closeByUser();
    opened.close();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(p1.api.windows.pip.current).toBeNull();
    expect(p1.pipUndone).toEqual([opened.window]);
  });

  it("closes another module's window for a new request", async () => {
    const p1 = await tab();
    const first = await p1.api.windows.pip.request("modular-av-dock", SIZE);
    const closed = vi.fn();
    first.onClose(closed);

    const second = await p1.api.windows.pip.request("modular-av-tokens", SIZE);

    expect(closed).toHaveBeenCalledTimes(1);
    expect(p1.api.windows.pip.current).toBe(second);
    expect(second.owner).toBe("modular-av-tokens");
  });

  it("is unsupported where the browser has none", async () => {
    const p1 = await tab({ noPip: true });

    expect(p1.api.windows.pip.supported()).toBe(false);
    await expect(
      p1.api.windows.pip.request("modular-av-dock", SIZE),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("explains a refusal by the browser and a bad request", async () => {
    const p1 = await tab();
    p1.pip.deny("NotAllowedError");

    await expect(
      p1.api.windows.pip.request("modular-av-dock", SIZE),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(p1.api.windows.pip.request("", SIZE)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(
      p1.api.windows.pip.request("modular-av-dock", { width: -1, height: 2 }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(p1.api.windows.pip.current).toBeNull();
  });
});
