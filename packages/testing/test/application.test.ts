// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { FakeApplicationV2, FakeAVConfig } from "../src/foundry/application.ts";
import { createFakeWorld } from "../src/foundry/world.ts";

afterEach(() => {
  document.body.replaceChildren();
});

class Window extends FakeApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: "test-window",
    window: { title: "Test", frame: true },
  };
  closes = 0;

  override _onClose(): void {
    this.closes += 1;
  }
}

describe("ApplicationV2 (client/applications/api/application.mjs)", () => {
  it("renders into a framed window in the page, and closes it", async () => {
    // Arrange
    const app = new Window();

    // Act
    await app.render({ force: true });

    // Assert
    expect(app.rendered).toBe(true);
    const element = document.getElementById("test-window");
    expect(element?.querySelector(".window-title")?.textContent).toBe("Test");
    expect(element?.querySelector(".window-content")).not.toBeNull();
    await app.close();
    expect(document.getElementById("test-window")).toBeNull();
    expect([app.rendered, app.closes, app.element]).toEqual([false, 1, null]);
  });

  it("hands the content region to _replaceHTML, a fresh one after closing", async () => {
    const contents: HTMLElement[] = [];
    class Probe extends Window {
      override _replaceHTML(_result: unknown, content: HTMLElement): void {
        contents.push(content);
      }
    }
    const app = new Probe();

    await app.render({ force: true });
    await app.render();
    await app.close();
    await app.render({ force: true });

    expect(contents).toHaveLength(3);
    expect(contents[0]).toBe(contents[1]);
    expect(contents[2]).not.toBe(contents[0]);
    expect(contents.every((c) => c.classList.contains("window-content"))).toBe(
      true,
    );
  });

  it("merges the class's default options with those it is given", () => {
    const app = new Window({ id: "other" });

    expect(app.options).toMatchObject({
      id: "other",
      window: { title: "Test" },
    });
  });
});

describe("Foundry's A/V settings (client/av/master.mjs, client/game.mjs)", () => {
  it("has its config window on game.webrtc and as the settings menu", () => {
    const client = createFakeWorld({
      users: [{ id: "p1", name: "Player1", role: 1 }],
    }).connect("p1");

    client.runLifecycle();

    expect(client.game.webrtc?.config).toBeInstanceOf(FakeAVConfig);
    expect(client.game.settings.menus.get("core.webrtc")?.type).toBe(
      FakeAVConfig,
    );
  });
});
