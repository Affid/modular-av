// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openPopover } from "../src/popover.ts";

/** happy-dom lays nothing out: sizes are given, resizes reported by hand. */
let observed: (() => void) | null = null;
class FakeResizeObserver {
  constructor(callback: () => void) {
    observed = callback;
  }
  observe(): void {
    return undefined;
  }
  disconnect(): void {
    observed = null;
  }
}

const box = (top: number, height: number) =>
  ({
    top,
    height,
    left: 10,
    width: 200,
    right: 210,
    bottom: top + height,
  }) as DOMRect;

afterEach(() => {
  observed = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("a popover whose content grows after it opens", () => {
  it("is placed again, still above its anchor", () => {
    // Arrange: an anchor near the bottom, a popover filled later.
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("innerHeight", 800);
    const anchor = document.createElement("button");
    document.body.append(anchor);
    anchor.getBoundingClientRect = () => box(700, 20);
    let height = 40;
    const content = document.createElement("div");
    const popover = openPopover({ anchor, content, label: "Details" });
    popover.element.getBoundingClientRect = () => box(0, height);
    popover.reposition();
    expect(popover.element.style.top).toBe("652px");

    // Act: the details arrive.
    height = 300;
    observed?.();

    // Assert: its bottom stays by the anchor.
    expect(popover.element.style.top).toBe("392px");
    expect(popover.element.dataset.side).toBe("above");
    popover.close();
    expect(observed).toBeNull();
  });
});
