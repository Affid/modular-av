// @vitest-environment happy-dom
// The scattered layout's wiring; its geometry needs a real browser and is
// checked in the browser tier (test/browser/scattered.spec.ts).
import { avState, participantState } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import {
  fakeHost,
  fakeScene,
  settle,
  testDock,
  type TestDockOptions,
} from "./context.ts";

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

describe("a scene's layout", () => {
  const LAYOUT = "modular-av-dock.layout";

  const tavern = () => {
    const scene = fakeScene("tavern");
    scene.flags.set(
      LAYOUT,
      JSON.stringify({ tiles: { p1: spot("left", 8, 0) } }),
    );
    return scene;
  };

  const menuItem = (root: HTMLElement, action: string) => {
    root.querySelector<HTMLButtonElement>(".mav-dock-placement")?.click();
    return document.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
  };

  const moveDown = (tile: HTMLElement): void => {
    tile.querySelector(".mav-dock-tile-move")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  it("shows the layout a GM saved for the scene", async () => {
    const { placement, tile } = dock({ scene: tavern() });

    await placement("scattered");

    expect(tile("p1").dataset.anchor).toBe("left");
    expect(tile("me").dataset.anchor).toBe("top-left");
  });

  it("becomes the player's own on that scene once they move a tile, until they go back", async () => {
    const { placement, saved, tile, root } = dock({ scene: tavern() });
    await placement("scattered");

    moveDown(tile("p1"));

    const layouts = () =>
      saved.get("modular-av-dock.scatteredLayouts") as {
        own: { tiles: object };
        scenes: Record<string, unknown>;
      };
    expect(Object.keys(layouts().scenes)).toEqual(["tavern"]);
    expect(layouts().own.tiles).toEqual({});
    const back = menuItem(root, "back-to-scene");
    expect(back?.textContent).toBe("Back to the scene's layout");
    back?.click();
    await settle();
    expect(layouts().scenes).toEqual({});
    expect(tile("p1").dataset.anchor).toBe("left");
  });

  it("lets a GM save the tiles as the scene's layout, and remove it", async () => {
    const scene = fakeScene("hall");
    const { placement, root } = dock({ scene, isGM: true });
    await placement("scattered");

    menuItem(root, "save-scene-layout")?.click();
    await settle();

    const stored = JSON.parse(String(scene.flags.get(LAYOUT))) as {
      tiles: Record<string, { anchor: string }>;
    };
    expect(stored.tiles.p1?.anchor).toBe("top-right");
    expect(Object.keys(stored.tiles).sort()).toEqual(["me", "p1"]);
    menuItem(root, "clear-scene-layout")?.click();
    await settle();
    expect(scene.flags.has(LAYOUT)).toBe(false);
  });

  it("offers scene layouts to GMs only, and only while scattered", async () => {
    const player = dock({ scene: fakeScene("hall") });
    await player.placement("scattered");
    expect(menuItem(player.root, "save-scene-layout")).toBeNull();
    document.body.replaceChildren();

    const gm = dock({ scene: fakeScene("hall"), isGM: true });
    expect(menuItem(gm.root, "save-scene-layout")).toBeNull();
  });

  it("follows the scene shown and its layout", async () => {
    const scene = fakeScene("hall");
    const { placement, tile, sceneChanged } = dock({ scene });
    await placement("scattered");
    expect(tile("p1").dataset.anchor).toBe("top-right");

    scene.flags.set(LAYOUT, JSON.stringify({ tiles: { p1: spot("bottom") } }));
    sceneChanged();

    expect(tile("p1").dataset.anchor).toBe("bottom");
  });

  it("ignores a scene layout that is broken", async () => {
    const scene = fakeScene("hall");
    scene.flags.set(LAYOUT, "{not json");
    const { placement, tile } = dock({ scene });

    await placement("scattered");

    expect(tile("p1").dataset.anchor).toBe("top-right");
  });
});

describe("loading the scattered layout", () => {
  /** A loader the test lets through when it wants. */
  function gated() {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let loads = 0;
    const load = async () => {
      loads += 1;
      await gate;
      return import("../src/scattered/scattered.ts");
    };
    return {
      load,
      release: () => {
        release();
      },
      loads: () => loads,
    };
  }

  function mountWith(load: ReturnType<typeof gated>["load"]) {
    const test = testDock({ state: avState({ participants: [me, p1] }) });
    const host = fakeHost("left");
    const mounted = camerasSurface(test.ctx, load).mount(host);
    const root = host.element.querySelector<HTMLElement>(".mav-dock");
    if (!root) throw new Error("not mounted");
    const choose = async (name: string): Promise<void> => {
      root.querySelector<HTMLButtonElement>(".mav-dock-placement")?.click();
      document
        .querySelector<HTMLButtonElement>(
          `[data-placement="${name}"][role="menuitemradio"]`,
        )
        ?.click();
      await settle();
    };
    const anchored = () =>
      [...root.querySelectorAll<HTMLElement>(".mav-dock-tile")].filter(
        (t) => t.dataset.anchor !== undefined,
      ).length;
    return { root, mounted, choose, anchored };
  }

  it("doesn't scatter a dock moved elsewhere while the code loaded", async () => {
    const gate = gated();
    const { root, choose, anchored } = mountWith(gate.load);

    await choose("scattered");
    await choose("top");
    gate.release();
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.dataset.placement).toBe("top");
    expect(anchored()).toBe(0);
    expect(root.firstElementChild?.classList).toContain("mav-dock-header");
  });

  it("drops a layout that loads after the dock was unmounted", async () => {
    const gate = gated();
    const { root, mounted, choose } = mountWith(gate.load);

    await choose("scattered");
    mounted.unmount();
    gate.release();
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Nothing was set up: the header stayed where the dock left it.
    expect(root.querySelector(".mav-dock-panel > .mav-dock-header")).toBeNull();
  });

  it("scatters once when asked twice while loading", async () => {
    const gate = gated();
    const { root, choose } = mountWith(gate.load);

    await choose("scattered");
    await choose("scattered");
    gate.release();
    await vi.waitFor(() => {
      if (!root.querySelector(".mav-dock-panel > .mav-dock-header"))
        throw new Error("not scattered yet");
    });

    expect(root.querySelectorAll(".mav-dock-header")).toHaveLength(1);
    expect(root.querySelectorAll(".mav-dock-tile[data-anchor]").length).toBe(2);
  });
});

describe("when Foundry can't make room", () => {
  it("scatters all the same, and reports it", async () => {
    const test = testDock({
      state: avState({ participants: [me, p1] }),
      foundrySettings: [
        {
          namespace: "modular-av-dock",
          key: "mode",
          scope: "user",
          value: "scattered",
        },
      ],
    });
    const host = fakeHost("left");
    const failing = {
      ...host,
      get placement() {
        return host.placement;
      },
      setPlacement: () => Promise.reject(new Error("hotbar not rendered")),
    };

    camerasSurface(test.ctx).mount(failing);
    const root = host.element.querySelector<HTMLElement>(".mav-dock");

    await vi.waitFor(() => {
      if (!root?.querySelector(".mav-dock-panel > .mav-dock-header"))
        throw new Error("not scattered yet");
    });
    expect(test.errors).toHaveLength(1);
  });
});
