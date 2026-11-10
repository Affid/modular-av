// @vitest-environment happy-dom
import { avState, participantState } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { fakeHost, settle, testDock, type TestDockOptions } from "./context.ts";

beforeEach(() => {
  window.innerWidth = 1200;
  window.innerHeight = 800;
});

afterEach(() => {
  document.body.replaceChildren();
});

const me = participantState({ id: "me", name: "Me", isLocal: true });

function dock(options: TestDockOptions = {}) {
  const test = testDock({ state: avState({ participants: [me] }), ...options });
  const host = fakeHost("right");
  camerasSurface(test.ctx).mount(host);
  const root = host.element.querySelector<HTMLElement>(".mav-dock");
  if (!root) throw new Error("not mounted");
  // From wherever the dock is: Foundry's page or a window of its own.
  const placement = async (name: string): Promise<void> => {
    root.querySelector<HTMLButtonElement>(".mav-dock-placement")?.click();
    root.ownerDocument
      .querySelector<HTMLButtonElement>(
        `[data-placement="${name}"][role="menuitemradio"]`,
      )
      ?.click();
    await settle();
  };
  return { ...test, host, root, placement };
}

describe("where the dock is", () => {
  it("starts on Foundry's dock side", async () => {
    const { root, host } = dock();
    await settle();

    expect(root.dataset.placement).toBe("right");
    expect(host.placements.at(-1)).toBe("right");
  });

  it("docks on another side through the placement menu", async () => {
    const { root, host, placement } = dock();

    await placement("top");

    expect(root.dataset.placement).toBe("top");
    expect(host.placements.at(-1)).toBe("top");
  });

  it("floats where it was left, kept on screen, and remembers it", async () => {
    const { root, host, placement, saved } = dock();
    saved.set("modular-av-dock.floatingRect", {
      left: 2000,
      top: 50,
      width: 300,
      height: 200,
    });

    await placement("floating");

    expect(root.dataset.placement).toBe("floating");
    expect(host.placements.at(-1)).toBe("free");
    expect([root.style.left, root.style.top]).toEqual(["892px", "50px"]);
    expect(saved.get("modular-av-dock.mode")).toBe("floating");
  });

  it("offers a window of its own everywhere, and one always on top only where the browser can", () => {
    const { host } = dock();

    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-placement")
      ?.click();
    const item = (name: string) =>
      document.querySelector<HTMLButtonElement>(`[data-placement="${name}"]`);

    expect(item("window")?.disabled).toBe(false);
    expect(item("on-top")?.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "A window always on top needs Chrome or Edge.",
    );
  });

  it("moves into a normal window of its own and comes back when it closes", async () => {
    const { root, host, placement, api } = dock();

    await placement("window");
    const popup = api.windows.popup.current;

    expect(popup?.owner).toBe("modular-av-dock");
    expect(root.ownerDocument).toBe(popup?.document);
    expect(root.dataset.placement).toBe("window");
    expect(host.placements.at(-1)).toBe("free");
    popup?.close();
    await settle();
    expect(root.parentElement).toBe(host.element);
    expect(root.dataset.placement).toBe("right");
  });

  it("moves into the window always on top, closing the other one", async () => {
    const { root, placement, api } = dock({ pip: true });
    await placement("window");
    const popup = api.windows.popup.current;

    await placement("on-top");

    expect(api.windows.pip.current?.document).toBe(root.ownerDocument);
    expect(root.dataset.placement).toBe("on-top");
    expect(api.windows.popup.current).toBeNull();
    expect(popup).not.toBeNull();
  });

  it("offers full screen in its normal window only", async () => {
    // Arrange: happy-dom has no full screen; each window's document gets it.
    const make = document.implementation.createHTMLDocument.bind(
      document.implementation,
    );
    vi.spyOn(document.implementation, "createHTMLDocument").mockImplementation(
      (title) =>
        Object.defineProperty(make(title), "fullscreenEnabled", {
          value: true,
        }),
    );
    const { root, placement } = dock({ pip: true });
    const button = () =>
      root.querySelector<HTMLButtonElement>(".mav-dock-fullscreen");

    // Act
    const docked = button()?.hidden;
    await placement("window");
    const inWindow = button()?.hidden;
    const asked = { count: 0 };
    root.ownerDocument.documentElement.requestFullscreen = () => {
      asked.count += 1;
      return Promise.resolve();
    };
    button()?.click();
    await placement("on-top");
    const onTop = button()?.hidden;

    // Assert
    expect([docked, inWindow, onTop]).toEqual([true, false, true]);
    expect(asked.count).toBe(1);
    expect(button()?.getAttribute("aria-label")).toBe("Full screen");
    vi.restoreAllMocks();
  });

  it("collapses to its header and panel, and remembers it", () => {
    const { root, host, saved } = dock();

    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-collapse")
      ?.click();

    expect(root.hasAttribute("data-collapsed")).toBe(true);
    expect(saved.get("modular-av-dock.collapsed")).toBe(true);
    expect(
      host.element
        .querySelector(".mav-dock-collapse")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
