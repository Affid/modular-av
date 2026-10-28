// @vitest-environment happy-dom
import { avState, participantState } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  const placement = async (name: string): Promise<void> => {
    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-placement")
      ?.click();
    document
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

  it("offers its own window only where the browser can", () => {
    const { host } = dock();

    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-placement")
      ?.click();
    const item = document.querySelector<HTMLButtonElement>(
      '[data-placement="window"]',
    );

    expect(item?.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "A window of its own needs Chrome or Edge.",
    );
  });

  it("moves into its own window and comes back when it closes", async () => {
    const { root, host, placement, api } = dock({ pip: true });

    await placement("window");
    const pip = api.windows.pip.current;

    expect(pip?.owner).toBe("modular-av-dock");
    expect(root.ownerDocument).toBe(pip?.document);
    expect(host.placements.at(-1)).toBe("free");
    pip?.close();
    await settle();
    expect(root.parentElement).toBe(host.element);
    expect(root.dataset.placement).toBe("right");
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
