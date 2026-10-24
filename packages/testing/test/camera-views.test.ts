// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { FakeCameraViews } from "../src/foundry/av-classes.ts";
import { createFakeWorld } from "../src/foundry/world.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("CameraViews render steps (client/applications/api/application.mjs)", () => {
  it("creates its element on the first render and puts it next to #interface", async () => {
    // Arrange
    const iface = document.createElement("div");
    iface.id = "interface";
    document.body.append(iface);
    const views = new FakeCameraViews();

    // Act
    await views.render({ force: true });

    // Assert
    expect(views.element?.id).toBe("camera-views");
    expect(views.element?.nextElementSibling).toBe(iface);
    expect(views.element?.querySelector("[data-part=cameras]")).not.toBeNull();
    expect(views.element?.hidden).toBe(false);
    expect(views.rendered).toBe(true);
  });

  it("runs the steps a subclass overrides, the first render only once", async () => {
    const steps: string[] = [];
    class Sub extends FakeCameraViews {
      override _configureRenderParts(): Record<string, object> {
        steps.push("parts");
        return {};
      }
      override _renderHTML(): Promise<Record<string, HTMLElement>> {
        steps.push("html");
        return Promise.resolve({});
      }
      override _replaceHTML(_result: unknown, content: HTMLElement): void {
        steps.push(`replace:${content.id}`);
      }
      override _onFirstRender(): Promise<void> {
        steps.push("first");
        return Promise.resolve();
      }
      override async _onRender(
        context: object,
        options: object,
      ): Promise<void> {
        await super._onRender(context, options);
        steps.push("render");
      }
      override get hidden(): boolean {
        return true;
      }
    }
    const views = new Sub();

    await views.render();
    await views.render();

    expect(steps).toEqual([
      ...["parts", "html", "replace:camera-views", "first", "render"],
      ...["parts", "html", "replace:camera-views", "render"],
    ]);
    expect(views.element?.hidden).toBe(true);
  });

  it("is rendered with force when Foundry sets up its interface", () => {
    const client = createFakeWorld({
      users: [{ id: "p1", name: "Player1", role: 1 }],
    }).connect("p1");

    client.runLifecycle();

    expect(client.ui.webrtc?.renders[0]).toEqual({ force: true });
  });
});
