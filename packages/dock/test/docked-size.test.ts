// @vitest-environment happy-dom
import type { CamerasPlacement } from "@modular-av/api";
import { avState, participantState } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { parseDockedSize } from "../src/cameras/docked-size.ts";
import { fakeHost, settle, testDock } from "./context.ts";

beforeEach(() => {
  window.innerWidth = 1200;
  window.innerHeight = 800;
});

afterEach(() => {
  document.body.replaceChildren();
});

const SIZE_KEY = "modular-av-dock.dockedSize";
const me = participantState({ id: "me", name: "Me", isLocal: true });

/** The host's box: its inline size while dragged, else the theme's. */
function measured(element: HTMLElement, theme = { width: 300, height: 225 }) {
  element.getBoundingClientRect = () => {
    const width = parseFloat(element.style.width || String(theme.width));
    const height = parseFloat(element.style.height || String(theme.height));
    return {
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
}

function dock(
  side: CamerasPlacement = "right",
  saved?: unknown,
  theme?: { width: number; height: number },
) {
  const test = testDock({ state: avState({ participants: [me] }) });
  if (saved !== undefined) test.saved.set(SIZE_KEY, saved);
  const host = fakeHost(side);
  measured(host.element, theme);
  const mounted = camerasSurface(test.ctx).mount(host);
  const edge = host.element.querySelector<HTMLElement>(".mav-dock-edge");
  const grip = host.element.querySelector<HTMLButtonElement>(
    ".mav-dock-edge-grip",
  );
  if (!edge || !grip) throw new Error("no edge");
  const width = (): string =>
    host.element.style.getPropertyValue("--mav-dock-width");
  const height = (): string =>
    host.element.style.getPropertyValue("--mav-dock-height");
  return { ...test, host, edge, grip, width, height, mounted };
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

function drag(handle: Element, dx: number, dy: number): void {
  pointer(handle, "pointerdown", 500, 400);
  pointer(handle, "pointermove", 500 + dx, 400 + dy);
  pointer(handle, "pointerup", 500 + dx, 400 + dy);
}

describe("resizing the docked dock", () => {
  it.each([
    ["left", 50, 0, { width: 350, height: null }],
    ["right", -100, 0, { width: 400, height: null }],
    ["top", 0, 75, { width: null, height: 300 }],
    ["bottom", 0, -25, { width: null, height: 250 }],
  ] as const)(
    "docked %s, its inner edge drags it wider or taller and remembers it",
    async (side, dx, dy, expected) => {
      // Arrange
      const { grip, host, saved, width, height } = dock(side);
      await settle();

      // Act
      drag(grip, dx, dy);

      // Assert
      expect(saved.get(SIZE_KEY)).toEqual(expected);
      expect([width(), height()]).toEqual([
        expected.width ? `${String(expected.width)}px` : "",
        expected.height ? `${String(expected.height)}px` : "",
      ]);
      expect([host.element.style.width, host.element.style.height]).toEqual([
        "",
        "",
      ]);
    },
  );

  it("drags from anywhere along the edge, not only the grip", async () => {
    const { edge, saved } = dock("right");
    await settle();

    drag(edge, -40, 0);

    expect(saved.get(SIZE_KEY)).toEqual({ width: 340, height: null });
  });

  it("keeps the size between its smallest and half the window", async () => {
    const { grip, saved } = dock("right");
    await settle();

    drag(grip, 500, 0);
    expect(saved.get(SIZE_KEY)).toEqual({ width: 200, height: null });

    drag(grip, -2000, 0);
    expect(saved.get(SIZE_KEY)).toEqual({ width: 600, height: null });
  });

  it("keeps the other side's size when one side changes", async () => {
    const { grip, saved } = dock("left", { width: null, height: 260 });
    await settle();

    drag(grip, 20, 0);

    expect(saved.get(SIZE_KEY)).toEqual({ width: 320, height: 260 });
  });

  it("saves nothing for a click that doesn't move it", async () => {
    const { grip, saved } = dock("right");
    await settle();

    drag(grip, 0, 0);

    expect(saved.has(SIZE_KEY)).toBe(false);
  });

  it("saves nothing for a click on a theme's size outside the limits", async () => {
    const { grip, saved } = dock("right", undefined, {
      width: 150,
      height: 225,
    });
    await settle();

    drag(grip, 0, 0);

    expect(saved.has(SIZE_KEY)).toBe(false);
  });

  it("keeps the other side's size as saved since, from another device", async () => {
    const { grip, saved } = dock("right");
    await settle();
    saved.set(SIZE_KEY, { width: null, height: 280 });

    drag(grip, -20, 0);

    expect(saved.get(SIZE_KEY)).toEqual({ width: 320, height: 280 });
  });

  it("resizes by keyboard from its grip", async () => {
    const { grip, saved } = dock("right");
    await settle();

    grip.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );

    expect(saved.get(SIZE_KEY)).toEqual({ width: 310, height: null });
  });

  it("shows the saved size when mounted, and goes back to the theme's on a double-click", async () => {
    const { edge, saved, width, height } = dock("right", {
      width: 420,
      height: 180,
    });
    await settle();
    expect([width(), height()]).toEqual(["420px", "180px"]);

    edge.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(width()).toBe("");
    expect(height()).toBe("180px");
    expect(saved.get(SIZE_KEY)).toEqual({ width: null, height: 180 });
  });

  it("goes back to the theme's size with Home on its grip", async () => {
    const { grip, saved, width } = dock("left", { width: 420, height: null });
    await settle();

    grip.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );

    expect(width()).toBe("");
    expect(saved.get(SIZE_KEY)).toEqual({ width: null, height: null });
  });

  it("writes nothing when reset on the theme's size already", async () => {
    const { edge, saved } = dock("right");
    await settle();

    edge.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(saved.has(SIZE_KEY)).toBe(false);
  });

  it("leaves nothing on Foundry's element once unmounted", async () => {
    const { mounted, width, height } = dock("right", {
      width: 420,
      height: 180,
    });
    await settle();

    mounted.unmount();

    expect([width(), height()]).toEqual(["", ""]);
  });

  it("doesn't resize while floating", async () => {
    const { grip, saved, host } = dock("right");
    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-placement")
      ?.click();
    document
      .querySelector<HTMLButtonElement>(
        '[data-placement="floating"][role="menuitemradio"]',
      )
      ?.click();
    await settle();

    drag(grip, -100, 0);

    expect(saved.has(SIZE_KEY)).toBe(false);
    expect(host.element.style.width).toBe("");
  });

  it("labels its grip for screen readers", () => {
    const { grip } = dock("right");

    expect(grip.getAttribute("aria-label")).toBe(
      "Resize the dock (arrow keys; Home or a double-click resets it)",
    );
  });
});

describe("parseDockedSize", () => {
  it("keeps sizes in bounds and drops what isn't one", () => {
    expect(parseDockedSize({ width: 100, height: 99_999 })).toEqual({
      width: 200,
      height: 4000,
    });
    expect(parseDockedSize({ width: "wide", height: Number.NaN })).toEqual({
      width: null,
      height: null,
    });
    expect(parseDockedSize(null)).toEqual({ width: null, height: null });
  });
});
