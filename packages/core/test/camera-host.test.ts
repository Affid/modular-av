// @vitest-environment happy-dom
import type {
  CamerasHost,
  CamerasSurfaceDefinition,
  ModularAV,
} from "@modular-av/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTable, master, type Tab } from "./table.ts";

beforeEach(() => {
  vi.useFakeTimers();
  const iface = document.createElement("div");
  iface.id = "interface";
  document.body.append(iface);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

interface Recorded {
  readonly hosts: CamerasHost[];
  readonly unmounts: number[];
}

function camerasSurface(
  options: { readonly fail?: boolean } = {},
): CamerasSurfaceDefinition & { readonly recorded: Recorded } {
  const recorded: Recorded = { hosts: [], unmounts: [] };
  return {
    kind: "cameras",
    id: "test.cameras",
    label: "Test cameras",
    recorded,
    mount(host) {
      if (options.fail) throw new Error("broken surface");
      recorded.hosts.push(host);
      const content = host.element.ownerDocument.createElement("div");
      content.className = "test-dock";
      host.element.append(content);
      return {
        unmount: () => {
          recorded.unmounts.push(1);
        },
      };
    },
  };
}

const withSurface =
  (surface: CamerasSurfaceDefinition) =>
  (api: ModularAV): void => {
    api.surfaces.register(surface);
  };

const dock = (tab: Tab): HTMLElement | null =>
  tab.client.ui.webrtc?.element ?? null;

describe("the core's camera dock host", () => {
  it("is Foundry's dock when no module shows the cameras", async () => {
    const table = createTable();
    const p1 = table.join("p1");
    await table.settle();

    expect(dock(p1)?.querySelector("[data-part=cameras]")).not.toBeNull();
  });

  it("mounts the chosen surface once in its element instead of Foundry's parts", async () => {
    // Arrange
    const surface = camerasSurface();
    const table = createTable();

    // Act
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();
    await p1.client.ui.webrtc?.render();

    // Assert
    expect(surface.recorded.hosts).toHaveLength(1);
    expect(surface.recorded.hosts[0]?.element).toBe(dock(p1));
    expect(dock(p1)?.querySelector("[data-part]")).toBeNull();
    expect(dock(p1)?.querySelector(".test-dock")).not.toBeNull();
    expect(dock(p1)?.hidden).toBe(false);
    expect(p1.client.ui.webrtc?.getUserVideoElement("p1")).toBeNull();
    expect(p1.errors).toEqual([]);
  });

  it("tells Foundry where the cameras are, so its hotbar makes room", async () => {
    // Arrange
    const surface = camerasSurface();
    const table = createTable();
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();
    const host = surface.recorded.hosts[0];
    const views = p1.client.ui.webrtc;

    // Act / Assert
    expect(host?.placement).toBe("left");
    await host?.setPlacement("top");
    expect(master(p1).settings.client.dockPosition).toBe("top");
    expect([views?.isVertical, views?.isHorizontal]).toEqual([false, true]);
    await host?.setPlacement("free");
    expect(host?.placement).toBe("free");
    expect(master(p1).settings.client.dockPosition).toBe("top");
    expect([views?.isVertical, views?.isHorizontal]).toEqual([false, false]);
    await host?.setPlacement("right");
    expect([views?.isVertical, views?.isHorizontal]).toEqual([true, false]);
  });

  it("places the cameras before Foundry's hotbar has rendered", async () => {
    const surface = camerasSurface();
    const table = createTable();
    const p1 = table.join("p1", { register: withSurface(surface) });
    await table.settle();
    // Foundry's Hotbar#_onResize reads its element, which isn't there yet.
    let resized = 0;
    Object.assign(p1.client.ui, {
      hotbar: {
        element: null,
        _onResize() {
          throw new TypeError("Cannot read properties of null");
        },
      },
    });

    await surface.recorded.hosts[0]?.setPlacement("free");

    expect(surface.recorded.hosts[0]?.placement).toBe("free");
    Object.assign(p1.client.ui, {
      hotbar: {
        element: document.createElement("div"),
        _onResize() {
          resized += 1;
        },
      },
    });
    await surface.recorded.hosts[0]?.setPlacement("left");
    expect(resized).toBe(1);
  });

  it("refuses a placement that doesn't exist", async () => {
    const surface = camerasSurface();
    const table = createTable();
    table.join("p1", { register: withSurface(surface) });
    await table.settle();

    await expect(
      surface.recorded.hosts[0]?.setPlacement("middle" as "left"),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("falls back to Foundry's dock and the plain status when the surface fails", async () => {
    // Arrange
    const table = createTable();

    // Act
    const p1 = table.join("p1", {
      register: withSurface(camerasSurface({ fail: true })),
      deny: { audio: "NotAllowedError" },
    });
    await table.settle();

    // Assert
    expect(dock(p1)?.querySelector("[data-part=cameras]")).not.toBeNull();
    expect(p1.errors).toHaveLength(1);
    expect(p1.client.notifications.map((n) => n.type)).toContain("warn");
  });

  it("leaves the status to the surface while it is mounted", async () => {
    const table = createTable();

    const p1 = table.join("p1", {
      register: withSurface(camerasSurface()),
      deny: { audio: "NotAllowedError" },
    });
    await table.settle();

    expect(p1.api.state.get().local.microphoneError).toBe("NotAllowedError");
    expect(p1.client.notifications).toEqual([]);
  });

  it("follows a player's own choice of Foundry's dock, from their next load", async () => {
    // Arrange
    const table = createTable();
    const surface = camerasSurface();
    const first = table.join("p1", { register: withSurface(surface) });
    await table.settle();

    // Act
    await first.client.game.settings.set(
      "modular-av",
      "camerasPlayer",
      "foundry",
    );
    const second = table.join("p1", { register: withSurface(surface) });
    await table.settle();

    // Assert
    expect(surface.recorded.hosts).toHaveLength(1);
    expect(dock(second)?.querySelector("[data-part=cameras]")).not.toBeNull();
  });

  it("uses Foundry's dock when the world names a surface that isn't there", async () => {
    const table = createTable();
    const gm = table.join("gm", { secret: true });
    await table.settle();
    await gm.client.game.settings.set("modular-av", "cameras", "gone.cameras");

    const p1 = table.join("p1", { register: withSurface(camerasSurface()) });
    await table.settle();

    expect(dock(p1)?.querySelector("[data-part=cameras]")).not.toBeNull();
  });
});

describe("player list surfaces", () => {
  it("decorate Foundry's player list instead of the core's badges", async () => {
    // Arrange
    const decorated: HTMLElement[] = [];
    const table = createTable();
    const p1 = table.join("p1", {
      register(api) {
        api.surfaces.register({
          kind: "players",
          id: "test.players",
          label: "Test players",
          decorate: (list) => decorated.push(list),
        });
      },
    });
    await table.settle();
    await p1.api.commands.setDeafened(true);
    await table.settle();
    const list = document.createElement("ol");
    const item = document.createElement("li");
    item.dataset.userId = "p1";
    list.append(item);

    // Act
    p1.client.Hooks.callAll("renderPlayers", {}, list);

    // Assert
    expect(decorated).toEqual([list]);
    expect(list.querySelector(".mav-badge")).toBeNull();
  });
});
