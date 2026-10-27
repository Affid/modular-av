// @vitest-environment happy-dom
// The scattered layout's wiring; its geometry needs a real browser and is
// checked in the browser tier (test/browser/scattered.spec.ts).
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
const p1 = participantState({ id: "p1", name: "Player1" });

function dock(options: TestDockOptions = {}) {
  const test = testDock({
    state: avState({ participants: [me, p1] }),
    ...options,
  });
  const host = fakeHost("left");
  camerasSurface(test.ctx).mount(host);
  const root = host.element.querySelector<HTMLElement>(".mav-dock");
  if (!root) throw new Error("not mounted");
  /** The scattered layout's code loads on demand. */
  const scattered = (): Promise<void> =>
    vi.waitFor(() => {
      if (!root.querySelector(".mav-dock-panel > .mav-dock-header"))
        throw new Error("not scattered yet");
    });
  const placement = async (name: string): Promise<void> => {
    root.querySelector<HTMLButtonElement>(".mav-dock-placement")?.click();
    document
      .querySelector<HTMLButtonElement>(
        `[data-placement="${name}"][role="menuitemradio"]`,
      )
      ?.click();
    await settle();
    if (name === "scattered") await scattered();
  };
  const tile = (id: string): HTMLElement => {
    const found = root.querySelector<HTMLElement>(
      `[data-participant-id="${id}"]`,
    );
    if (!found) throw new Error(`no tile for ${id}`);
    return found;
  };
  return { ...test, host, root, placement, tile, scattered };
}

const spot = (anchor: string, dx = 0, dy = 0, width = 240) => ({
  anchor,
  dx,
  dy,
  width,
});

describe("the scattered layout", () => {
  it("scatters the tiles from the placement menu, and remembers it", async () => {
    const { root, host, placement, saved, tile } = dock();

    await placement("scattered");

    expect(root.dataset.placement).toBe("scattered");
    expect(host.placements.at(-1)).toBe("free");
    expect(saved.get("modular-av-dock.mode")).toBe("scattered");
    // Each tile at a free corner, the local player's first.
    expect([tile("me").dataset.anchor, tile("p1").dataset.anchor]).toEqual([
      "top-left",
      "top-right",
    ]);
    expect(tile("me").style.width).toBe("240px");
    expect(tile("me").style.left).toBe("8px");
  });

  it("puts the header in the voice panel and shows the tiles' handles", async () => {
    const { root, placement, tile } = dock();

    await placement("scattered");

    const panel = root.querySelector(".mav-dock-panel");
    expect(panel?.querySelector(".mav-dock-header")).not.toBeNull();
    expect(panel?.querySelector("[data-status]")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".mav-dock-move")?.hidden).toBe(
      false,
    );
    expect(root.querySelector<HTMLElement>(".mav-dock-layout")?.hidden).toBe(
      true,
    );
    const move = tile("p1").querySelector<HTMLElement>(".mav-dock-tile-move");
    expect(move?.hidden).toBe(false);
    expect(move?.getAttribute("aria-label")).toBe(
      "Move Player1's tile (arrow keys)",
    );
  });

  it("goes back to the dock with the tiles fitted again", async () => {
    const { root, placement, tile } = dock();
    await placement("scattered");

    await placement("left");

    expect(root.firstElementChild?.classList).toContain("mav-dock-header");
    expect(tile("p1").style.left).toBe("");
    expect(tile("p1").dataset.anchor).toBeUndefined();
    expect(
      tile("p1").querySelector<HTMLElement>(".mav-dock-tile-move")?.hidden,
    ).toBe(true);
  });

  it("puts tiles and the panel where the player left them", async () => {
    const { placement, saved, tile, root } = dock();
    saved.set("modular-av-dock.scatteredLayouts", {
      own: {
        tiles: { p1: spot("bottom-right", -20, -20, 300) },
        panel: spot("top"),
      },
      scenes: {},
    });

    await placement("scattered");

    expect(tile("p1").dataset.anchor).toBe("bottom-right");
    expect(tile("p1").style.width).toBe("300px");
    // The local player's tile takes the first free anchor.
    expect(tile("me").dataset.anchor).toBe("top-left");
    expect(
      root.querySelector<HTMLElement>(".mav-dock-panel")?.dataset.anchor,
    ).toBe("top");
  });

  it("gives the defaults for a broken saved layout", async () => {
    const { placement, saved, tile } = dock();
    saved.set("modular-av-dock.scatteredLayouts", "{broken");

    await placement("scattered");

    expect(tile("p1").dataset.anchor).toBe("top-right");
  });

  it("starts scattered when the player left it so", async () => {
    const { root, tile, scattered } = dock({
      foundrySettings: [
        {
          namespace: "modular-av-dock",
          key: "mode",
          scope: "user",
          value: "scattered",
        },
      ],
    });
    await scattered();

    expect(root.dataset.placement).toBe("scattered");
    expect(tile("me").dataset.anchor).toBe("top-left");
  });

  it("saves where a tile was moved with the keyboard", async () => {
    const { placement, saved, tile } = dock();
    await placement("scattered");
    const move = tile("p1").querySelector<HTMLElement>(".mav-dock-tile-move");

    move?.focus();
    move?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );

    const layouts = saved.get("modular-av-dock.scatteredLayouts") as {
      own: { tiles: Record<string, unknown> };
    };
    expect(Object.keys(layouts.own.tiles)).toEqual(["p1"]);
    // The arrow moved the tile, not the focus.
    expect(document.activeElement).toBe(move);
  });
});
