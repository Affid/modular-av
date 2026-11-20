// @vitest-environment happy-dom
import { avState, participantState } from "@modular-av/testing";
import { afterEach, describe, expect, it } from "vitest";
import { camerasSurface } from "../src/cameras/dock.ts";
import { applyTheme, themeClass } from "../src/themes/apply.ts";
import { createThemes } from "../src/themes/choice.ts";
import { createThemeRegistry } from "../src/themes/registry.ts";
import type { ThemeDefinition } from "../src/themes/types.ts";
import { fakeHost, testDock } from "./context.ts";

const vines: ThemeDefinition = {
  id: "vines",
  label: "Vines",
  stylesheet: "modules/modular-av-dock-vines/vines.css",
  frames: { reach: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 } },
  preview: "modules/modular-av-dock-vines/preview.webp",
  suggestedLayout: "scattered",
};

afterEach(() => {
  document.body.replaceChildren();
  document.head.replaceChildren();
  document.documentElement.className = "";
});

describe("the theme registry", () => {
  it("takes themes only inside its hook, then keeps them", () => {
    const registry = createThemeRegistry();

    expect(() => {
      registry.register(vines);
    }).toThrow(/inside the "modularAVDock.register" hook/);
    registry.run(() => {
      registry.register(vines);
    });
    expect(() => {
      registry.register({ ...vines, id: "late" });
    }).toThrow(/inside the "modularAVDock.register" hook/);

    expect(registry.list().map((t) => t.id)).toEqual(["vines"]);
    expect(registry.get("vines")).toEqual(vines);
    expect(Object.isFrozen(registry.get("vines"))).toBe(true);
  });

  it("refuses a theme registered twice", () => {
    const registry = createThemeRegistry();

    registry.run(() => {
      registry.register(vines);
      expect(() => {
        registry.register(vines);
      }).toThrow(/registered already/);
    });
  });

  it.each([
    ["an id with capitals", { id: "Vines" }, /Theme id/],
    ["the default theme's id", { id: "default" }, /Theme id/],
    ["no label", { label: " " }, /needs a label/],
    [
      "a stylesheet on another host",
      { stylesheet: "https://x.test/a.css" },
      /stylesheet/,
    ],
    [
      "a stylesheet climbing out",
      { stylesheet: "modules/../secret.css" },
      /stylesheet/,
    ],
    [
      "a stylesheet that isn't CSS",
      { stylesheet: "modules/x/theme.js" },
      /stylesheet/,
    ],
    [
      "a preview that isn't an image",
      { preview: "modules/x/a.html" },
      /preview/,
    ],
    [
      "a frame reaching too far",
      { frames: { reach: { top: 0.9, right: 0, bottom: 0, left: 0 } } },
      /frames.reach/,
    ],
    [
      "a frame missing a side",
      { frames: { reach: { top: 0.1 } } },
      /frames.reach/,
    ],
    [
      "too much room round a tile",
      {
        frames: {
          reach: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
          room: { top: 0.9, right: 0, bottom: 0, left: 0 },
        },
      },
      /frames.room/,
    ],
    [
      "too much room round a tile in a grid",
      {
        frames: {
          reach: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
          gridRoom: { top: 0.9, right: 0, bottom: 0, left: 0 },
        },
      },
      /frames.gridRoom/,
    ],
    [
      "room in a grid missing a side",
      {
        frames: {
          reach: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
          gridRoom: { left: 0.1 },
        },
      },
      /frames.gridRoom/,
    ],
    ["no such layout", { suggestedLayout: "spiral" }, /no such layout/],
  ])("refuses %s", (_name, change, message) => {
    const registry = createThemeRegistry();

    registry.run(() => {
      expect(() => {
        registry.register({ ...vines, ...change } as ThemeDefinition);
      }).toThrow(message);
    });
  });

  it("keeps the room a theme asks for round its tiles, scattered and in a grid", () => {
    const registry = createThemeRegistry();
    const reach = { top: 0.11, right: 0.11, bottom: 0.11, left: 0.11 };
    const room = { ...reach, bottom: 0.18 };
    const gridRoom = { top: 0.05, right: 0.05, bottom: 0.12, left: 0.05 };

    registry.run(() => {
      registry.register({ ...vines, frames: { reach, room, gridRoom } });
    });

    const frames = registry.get("vines")?.frames;
    expect(frames).toEqual({ reach, room, gridRoom });
    expect(Object.isFrozen(frames?.room)).toBe(true);
    expect(Object.isFrozen(frames?.gridRoom)).toBe(true);
  });

  it("reads each side of a reach once: what it checked is what it keeps", () => {
    const registry = createThemeRegistry();
    let reads = 0;
    const shifty = {
      right: 0.1,
      bottom: 0.1,
      left: 0.1,
      // Fine when it is checked, far too much when it is read again.
      get top(): number {
        reads += 1;
        return reads === 1 ? 0.1 : 9;
      },
    };

    registry.run(() => {
      registry.register({ ...vines, frames: { reach: shifty } });
    });

    expect(registry.get("vines")?.frames?.reach.top).toBe(0.1);
  });

  it("leaves out the room a theme doesn't give", () => {
    const registry = createThemeRegistry();

    registry.run(() => {
      registry.register(vines);
    });

    expect(registry.get("vines")?.frames).toEqual({
      reach: vines.frames?.reach,
    });
  });
});

describe("the theme shown", () => {
  function themes(own: unknown, world: unknown) {
    const registry = createThemeRegistry();
    registry.run(() => {
      registry.register(vines);
    });
    const values = new Map<string, unknown>([
      ["modular-av-dock.theme", own],
      ["modular-av-dock.defaultTheme", world],
    ]);
    const settings = {
      register: () => undefined,
      get: (ns: string, key: string) => values.get(`${ns}.${key}`),
      set: (ns: string, key: string, value: unknown) => {
        values.set(`${ns}.${key}`, value);
        return Promise.resolve(value);
      },
    };
    return createThemes({ settings }, registry, "modular-av-dock");
  }

  it("is the player's choice, else the world's default", () => {
    expect(themes("vines", "default").shown()?.id).toBe("vines");
    expect(themes("", "vines").shown()?.id).toBe("vines");
    expect(themes("default", "vines").shown()).toBeNull();
    expect(themes("", "default").shown()).toBeNull();
  });

  it("falls back to the world's default for a theme no module registers", () => {
    expect(themes("gone", "vines").shown()?.id).toBe("vines");
    expect(themes("", "gone").shown()).toBeNull();
    expect(themes(42, undefined).shown()).toBeNull();
  });

  it("saves the player's and the world's choices and tells listeners", async () => {
    const chosen = themes("", "default");
    let told = 0;
    chosen.onChange(() => {
      told += 1;
    });

    await chosen.choose("vines");
    chosen.changed();

    expect(chosen.own()).toBe("vines");
    expect(chosen.shown()?.id).toBe("vines");
    expect(told).toBe(1);
  });
});

describe("applying a theme", () => {
  const route = (path: string): string => `/prefix/${path}`;

  it("loads only the chosen theme's stylesheet and marks the page", () => {
    applyTheme(document, vines, route);

    const links = document.head.querySelectorAll("link[data-mav-theme]");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(
      "/prefix/modules/modular-av-dock-vines/vines.css",
    );
    expect(document.documentElement.classList).toContain(themeClass("vines"));
  });

  it("swaps one theme for another, and back to the dock's own look", () => {
    applyTheme(document, vines, route);
    applyTheme(
      document,
      { ...vines, id: "moss", stylesheet: "m/moss.css" },
      route,
    );

    expect(
      [...document.head.querySelectorAll("link[data-mav-theme]")].map((l) =>
        l.getAttribute("href"),
      ),
    ).toEqual(["/prefix/m/moss.css"]);
    expect([...document.documentElement.classList]).toEqual(["mav-theme-moss"]);

    applyTheme(document, null, route);

    expect(document.head.querySelector("link[data-mav-theme]")).toBeNull();
    expect(document.documentElement.classList).toHaveLength(0);
  });

  it("keeps the stylesheet loaded when the same theme is applied again", () => {
    applyTheme(document, vines, route);
    const first = document.head.querySelector("link[data-mav-theme]");

    applyTheme(document, vines, route);

    expect(document.head.querySelector("link[data-mav-theme]")).toBe(first);
  });
});

/** Themes as the dock sees them, with the vines theme registered. */
function fakeThemes(
  start: { own?: string; world?: string } = {},
  theme: ThemeDefinition = vines,
) {
  let own = start.own ?? "";
  let world = start.world ?? "default";
  let listeners: (() => void)[] = [];
  const known = (id: string) => (id === "vines" ? theme : null);
  const themes = {
    list: () => [theme],
    own: () => own,
    worldDefault: () => world,
    shown: () => (own === "default" ? null : (known(own) ?? known(world))),
    choose: (id: string) => {
      own = id;
      themes.changed();
      return Promise.resolve();
    },
    chooseWorldDefault: (id: string) => {
      world = id;
      themes.changed();
      return Promise.resolve();
    },
    onChange: (listener: () => void) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    changed: () => {
      for (const listener of listeners) listener();
    },
  };
  return themes;
}

const me = participantState({ id: "me", isLocal: true });

describe("a theme's frames in the dock", () => {
  it("sizes the frame layer to the theme's reach and keeps as much room, and follows a change", async () => {
    const themes = fakeThemes({ own: "vines" });
    const { ctx } = testDock({
      state: avState({ participants: [me] }),
      themes,
    });
    const host = fakeHost("left");

    camerasSurface(ctx).mount(host);
    const root = host.element.querySelector<HTMLElement>(".mav-dock");
    const value = (name: string): string | undefined =>
      root?.style.getPropertyValue(name);

    expect(value("--mav-dock-frame-top")).toBe("0.08");
    expect(value("--mav-dock-room-top")).toBe("0.08");
    expect(value("--mav-dock-room-across")).toBe("1.16");
    await themes.choose("default");
    expect(value("--mav-dock-frame-top")).toBe("0");
    expect(value("--mav-dock-room-top")).toBe("0");
    expect(value("--mav-dock-room-across")).toBe("1");
  });

  it("keeps a theme's room round tiles, by layout, while the frame layer stays its reach", async () => {
    const even = (reach: number) => ({
      top: reach,
      right: reach,
      bottom: reach,
      left: reach,
    });
    const themes = fakeThemes(
      { own: "vines" },
      {
        ...vines,
        frames: {
          reach: even(0.11),
          room: { ...even(0.11), bottom: 0.18 },
          gridRoom: even(0.05),
        },
      },
    );
    const { ctx } = testDock({
      state: avState({ participants: [me] }),
      themes,
    });
    const host = fakeHost("left");
    camerasSurface(ctx).mount(host);
    const root = host.element.querySelector<HTMLElement>(".mav-dock");
    const value = (name: string): string | undefined =>
      root?.style.getPropertyValue(name);
    const move = (where: string): void => {
      host.element
        .querySelector<HTMLButtonElement>(".mav-dock-placement")
        ?.click();
      document
        .querySelector<HTMLElement>(
          `[data-placement="${where}"][role="menuitemradio"]`,
        )
        ?.click();
    };

    expect(value("--mav-dock-frame-top")).toBe("0.11");
    expect(value("--mav-dock-room-top")).toBe("0.05");
    expect(value("--mav-dock-room-across")).toBe("1.1");

    move("scattered");
    await expect.poll(() => value("--mav-dock-room-bottom")).toBe("0.18");
    expect(value("--mav-dock-room-top")).toBe("0.11");
    expect(value("--mav-dock-frame-bottom")).toBe("0.11");

    move("floating");
    await expect.poll(() => value("--mav-dock-room-top")).toBe("0.05");
    expect(value("--mav-dock-frame-top")).toBe("0.11");
  });

  it("uses a theme's scattered room in a grid when it gives none for grids", () => {
    const themes = fakeThemes(
      { own: "vines" },
      {
        ...vines,
        frames: {
          reach: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
          room: { top: 0.1, right: 0.1, bottom: 0.2, left: 0.1 },
        },
      },
    );
    const { ctx } = testDock({
      state: avState({ participants: [me] }),
      themes,
    });
    const host = fakeHost("left");

    camerasSurface(ctx).mount(host);
    const root = host.element.querySelector<HTMLElement>(".mav-dock");

    expect(root?.style.getPropertyValue("--mav-dock-room-bottom")).toBe("0.2");
    expect(root?.style.getPropertyValue("--mav-dock-frame-bottom")).toBe("0.1");
  });

  it("offers the theme's suggested layout, without moving the dock", () => {
    const themes = fakeThemes({ own: "vines" });
    const { ctx } = testDock({
      state: avState({ participants: [me] }),
      themes,
    });
    const host = fakeHost("left");
    camerasSurface(ctx).mount(host);

    host.element
      .querySelector<HTMLButtonElement>(".mav-dock-placement")
      ?.click();

    expect(
      document.querySelector(
        '[data-placement="scattered"][role="menuitemradio"]',
      )?.textContent,
    ).toBe("Scattered over the screen (the theme's suggestion)");
    expect(
      host.element.querySelector<HTMLElement>(".mav-dock")?.dataset.placement,
    ).toBe("left");
  });
});
