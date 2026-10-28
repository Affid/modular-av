// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { el } from "../src/dom.ts";
import { dragToMove, dragToResize } from "../src/drag.ts";
import { openPopover } from "../src/popover.ts";

beforeEach(() => {
  window.innerWidth = 1000;
  window.innerHeight = 800;
});

afterEach(() => {
  document.body.replaceChildren();
});

/** A fixed box at (100, 100), 200 × 100, with a handle inside. */
function box(): { target: HTMLElement; handle: HTMLButtonElement } {
  const handle = el("button", { text: "Move" });
  const target = el("div", { children: [handle] });
  document.body.append(target);
  let rect = { left: 100, top: 100, width: 200, height: 100 };
  target.getBoundingClientRect = () => {
    const left = parseFloat(target.style.left || String(rect.left));
    const top = parseFloat(target.style.top || String(rect.top));
    const width = parseFloat(target.style.width || String(rect.width));
    const height = parseFloat(target.style.height || String(rect.height));
    rect = { left, top, width, height };
    return {
      ...rect,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => rect,
    };
  };
  return { target, handle };
}

const pointer = (target: Element, type: string, x: number, y: number): void => {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      bubbles: true,
    }),
  );
};

const key = (target: Element, name: string, shiftKey = false): void => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true }),
  );
};

describe("dragToMove", () => {
  it("moves the box with the pointer, kept on screen, and reports where it ended", () => {
    // Arrange
    const { target, handle } = box();
    const onEnd = vi.fn();
    dragToMove(handle, target, { onEnd });

    // Act
    pointer(handle, "pointerdown", 150, 110);
    pointer(handle, "pointermove", 250, 160);
    pointer(handle, "pointermove", 2000, 160);
    pointer(handle, "pointerup", 2000, 160);

    // Assert
    expect([target.style.left, target.style.top]).toEqual(["792px", "150px"]);
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ left: 792, top: 150 }),
    );
  });

  it("ignores drags that start on a control inside the handle", () => {
    const { target } = box();
    const inner = el("button", { text: "Close" });
    const header = el("header", { children: [inner] });
    target.append(header);
    dragToMove(header, target, { onEnd: vi.fn() });

    pointer(inner, "pointerdown", 150, 110);
    pointer(header, "pointermove", 250, 160);

    expect(target.style.left).toBe("");
  });

  it("moves by keyboard from its handle, further with Shift", () => {
    const { target, handle } = box();
    const onEnd = vi.fn();
    dragToMove(handle, target, { onEnd });

    key(handle, "ArrowRight");
    key(handle, "ArrowDown", true);

    expect([target.style.left, target.style.top]).toEqual(["110px", "150px"]);
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  it("doesn't move while not enabled", () => {
    const { target, handle } = box();
    dragToMove(handle, target, { onEnd: vi.fn(), enabled: () => false });

    key(handle, "ArrowRight");
    pointer(handle, "pointerdown", 150, 110);
    pointer(handle, "pointermove", 250, 160);

    expect(target.style.left).toBe("");
  });

  it("stops once undone", () => {
    const { target, handle } = box();
    const undo = dragToMove(handle, target, { onEnd: vi.fn() });

    undo();
    key(handle, "ArrowRight");

    expect(target.style.left).toBe("");
  });
});

describe("dragToResize", () => {
  it("resizes on the edges it is given, never below the smallest size", () => {
    const { target, handle } = box();
    const onEnd = vi.fn();
    dragToResize(handle, target, {
      edges: () => ["right", "bottom"],
      min: { width: 150, height: 80 },
      onEnd,
    });

    pointer(handle, "pointerdown", 300, 200);
    pointer(handle, "pointermove", 200, 260);
    pointer(handle, "pointerup", 200, 260);

    expect([target.style.width, target.style.height]).toEqual([
      "150px",
      "160px",
    ]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("never resizes past the largest size, read when the drag starts", () => {
    const { target, handle } = box();
    let max = { width: 260, height: 400 };
    dragToResize(handle, target, {
      edges: () => ["right", "bottom"],
      min: { width: 150, height: 80 },
      max: () => max,
      onEnd: vi.fn(),
    });

    pointer(handle, "pointerdown", 300, 200);
    max = { width: 1000, height: 1000 };
    pointer(handle, "pointermove", 500, 250);
    pointer(handle, "pointerup", 500, 250);

    expect([target.style.width, target.style.height]).toEqual([
      "260px",
      "150px",
    ]);
  });

  it("leaves an edge it didn't move at its size, even outside the limits", () => {
    const { target, handle } = box();
    dragToResize(handle, target, {
      edges: () => ["right", "bottom"],
      min: { width: 250, height: 80 },
      max: () => ({ width: 1000, height: 90 }),
      onEnd: vi.fn(),
    });

    pointer(handle, "pointerdown", 300, 200);
    pointer(handle, "pointermove", 300, 200);
    pointer(handle, "pointerup", 300, 200);

    expect([target.style.width, target.style.height]).toEqual([
      "200px",
      "100px",
    ]);
  });

  it("resizes by keyboard: the arrows grow and shrink it", () => {
    const { target, handle } = box();
    dragToResize(handle, target, {
      edges: () => ["right", "bottom"],
      min: { width: 150, height: 80 },
      onEnd: vi.fn(),
    });

    key(handle, "ArrowRight");
    key(handle, "ArrowUp", true);

    expect([target.style.width, target.style.height]).toEqual([
      "210px",
      "80px",
    ]);
  });
});

describe("openPopover", () => {
  it("opens by its anchor, closes on Escape and gives the focus back", () => {
    // Arrange
    const anchor = el("button", { text: "Settings" });
    document.body.append(anchor);
    anchor.focus();
    const field = el("input");
    const onClose = vi.fn();

    // Act
    const popover = openPopover({
      anchor,
      content: el("div", { children: [field] }),
      label: "Voice & video settings",
      onClose,
    });

    // Assert
    expect(popover.element.isConnected).toBe(true);
    expect(popover.element.getAttribute("role")).toBe("dialog");
    expect(popover.element.getAttribute("aria-label")).toBe(
      "Voice & video settings",
    );
    expect(anchor.getAttribute("aria-expanded")).toBe("true");
    field.focus();
    key(field, "Escape");
    expect(popover.element.isConnected).toBe(false);
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(anchor);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a click outside, but not inside", () => {
    const anchor = el("button");
    const outside = el("div");
    document.body.append(anchor, outside);
    const content = el("div");
    const popover = openPopover({ anchor, content, label: "Menu" });

    pointer(content, "pointerdown", 0, 0);
    expect(popover.element.isConnected).toBe(true);
    pointer(outside, "pointerdown", 0, 0);
    expect(popover.element.isConnected).toBe(false);
  });

  it("opens in the anchor's document", () => {
    const other = document.implementation.createHTMLDocument("");
    const anchor = el("button", { doc: other });
    other.body.append(anchor);

    const popover = openPopover({ anchor, content: el("div"), label: "Menu" });

    expect(popover.element.ownerDocument).toBe(other);
    popover.close();
  });

  it("closes another open popover, but not the one it opens from", () => {
    const first = el("button");
    const second = el("button");
    document.body.append(first, second);
    const inner = el("button");
    const outer = openPopover({
      anchor: first,
      content: el("div", { children: [inner] }),
      label: "Settings",
    });

    const nested = openPopover({
      anchor: inner,
      content: el("div"),
      label: "Model",
    });
    expect(outer.element.isConnected).toBe(true);
    openPopover({ anchor: second, content: el("div"), label: "Menu" });

    expect(outer.element.isConnected).toBe(false);
    expect(nested.element.isConnected).toBe(false);
  });

  it("keeps a parent open for clicks in what it opened; Escape closes the newest", () => {
    const first = el("button");
    document.body.append(first);
    const inner = el("button");
    const outer = openPopover({
      anchor: first,
      content: el("div", { children: [inner] }),
      label: "Settings",
    });
    const choice = el("button");
    const nested = openPopover({
      anchor: inner,
      content: el("div", { children: [choice] }),
      label: "Model",
    });

    pointer(choice, "pointerdown", 0, 0);
    expect(outer.element.isConnected).toBe(true);
    key(choice, "Escape");
    expect([outer.element.isConnected, nested.element.isConnected]).toEqual([
      true,
      false,
    ]);
    openPopover({ anchor: inner, content: el("div"), label: "Model" });
    outer.close();
    expect(document.querySelectorAll(".mav-popover")).toHaveLength(0);
  });
});
