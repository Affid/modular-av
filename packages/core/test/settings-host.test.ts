// @vitest-environment happy-dom
import type {
  ModularAV,
  SettingsHost,
  SettingsSurfaceDefinition,
} from "@modular-av/api";
import { FakeAVConfig } from "@modular-av/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTable, master, type Tab } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

interface Probe {
  readonly hosts: SettingsHost[];
  cleanups: number;
}

function settingsSurface(): SettingsSurfaceDefinition & {
  readonly probe: Probe;
} {
  const probe: Probe = { hosts: [], cleanups: 0 };
  return {
    kind: "settings",
    id: "test.settings",
    label: "Test settings",
    probe,
    render(host) {
      probe.hosts.push(host);
      const form = host.content.ownerDocument.createElement("div");
      form.className = "test-settings";
      host.content.append(form);
      return () => {
        probe.cleanups += 1;
      };
    },
  };
}

const withSurface =
  (surface: SettingsSurfaceDefinition) =>
  (api: ModularAV): void => {
    api.surfaces.register(surface);
  };

interface Openable {
  render(options?: object): Promise<unknown>;
}

const fromMenu = (tab: Tab): Openable => {
  const menu = tab.client.game.settings.menus.get("core.webrtc");
  if (!menu) throw new Error("no A/V settings menu");
  return new menu.type() as Openable;
};

describe("the core's settings window", () => {
  it("is Foundry's own without a settings surface", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    expect(master(p1).config).toBeInstanceOf(FakeAVConfig);
    expect(p1.client.game.settings.menus.get("core.webrtc")?.type).toBe(
      FakeAVConfig,
    );
  });

  it("opens with the surface from the dock's gear and from Foundry's menu", async () => {
    // Arrange
    const surface = settingsSurface();
    const table = createTable();
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();

    // Act
    await (master(p1).config as Openable).render({ force: true });

    // Assert
    expect(surface.probe.hosts).toHaveLength(1);
    const window = document.getElementById("modular-av-settings");
    expect(window?.querySelector(".test-settings")).not.toBeNull();
    expect(window?.querySelector(".window-title")?.textContent).toBe(
      "Voice & Video Settings",
    );
    await surface.probe.hosts[0]?.close();
    expect(surface.probe.cleanups).toBe(1);
    expect(document.getElementById("modular-av-settings")).toBeNull();
    await fromMenu(p1).render({ force: true });
    expect(surface.probe.hosts).toHaveLength(2);
  });

  it("fills the window once while it stays open", async () => {
    const surface = settingsSurface();
    const table = createTable();
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();
    const window = master(p1).config as Openable;

    await window.render({ force: true });
    await window.render();

    expect(surface.probe.hosts).toHaveLength(1);
    expect(document.querySelectorAll(".test-settings")).toHaveLength(1);
  });

  it("fits the screen before Foundry places it: capped, scrolling, resizable", async () => {
    const surface = settingsSurface();
    const table = createTable();
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();
    const window = master(p1).config as Openable & {
      readonly element: HTMLElement | null;
      readonly options: { readonly window?: { readonly resizable?: boolean } };
    };

    await window.render({ force: true });

    expect(window.element?.style.maxHeight).toBe("calc(100vh - 32px)");
    expect(surface.probe.hosts[0]?.content.style.overflowY).toBe("auto");
    expect(window.options.window?.resizable).toBe(true);
  });

  it("offers a GM the modules window, and a player not", async () => {
    const surface = settingsSurface();
    const table = createTable();
    const gm = table.join("gm", { register: withSurface(surface) });
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();
    let opened = 0;
    gm.client.game.settings.menus.set("modular-av.modules", {
      name: "",
      label: "",
      restricted: true,
      type: class {
        render() {
          opened += 1;
          return Promise.resolve();
        }
      },
    });
    await (master(gm).config as Openable).render({ force: true });
    await (master(p1).config as Openable).render({ force: true });

    surface.probe.hosts[0]?.openModules?.();

    expect(opened).toBe(1);
    expect(surface.probe.hosts).toHaveLength(2);
    expect(Object.keys(surface.probe.hosts[1] ?? {})).not.toContain(
      "openModules",
    );
  });

  it("still reaches Foundry's own A/V settings", async () => {
    const surface = settingsSurface();
    const table = createTable();
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();
    await (master(p1).config as Openable).render({ force: true });

    surface.probe.hosts[0]?.openFoundrySettings();
    await table.settle();

    expect(document.getElementById("av-config")).not.toBeNull();
  });

  it("shows nothing broken when the surface fails, and says why", async () => {
    const table = createTable();
    const p1 = table.join("p1", {
      register: withSurface({
        ...settingsSurface(),
        render: () => {
          throw new Error("broken settings");
        },
      }),
    });
    await table.settle();

    await (master(p1).config as Openable).render({ force: true });
    await table.settle();

    expect(p1.errors).toHaveLength(1);
    expect(document.getElementById("modular-av-settings")).toBeNull();
    expect(document.getElementById("av-config")).not.toBeNull();
  });
});
