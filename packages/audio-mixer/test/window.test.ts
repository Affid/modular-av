// @vitest-environment happy-dom
import { FakeApplicationV2 } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import { createMixerWindow } from "../src/window/window.ts";

function setup() {
  const dispose = vi.fn();
  const fill = vi.fn((doc: Document) => ({
    element: doc.createElement("div"),
    dispose,
  }));
  const window = createMixerWindow(FakeApplicationV2, {
    title: "Audio mixer",
    stylesheet: "/modules/m/styles/mixer.css",
    fill,
  }) as unknown as FakeApplicationV2;
  return { window, fill, dispose };
}

describe("the mixer's window", () => {
  it("fills once however often it renders, and loads its styles once", async () => {
    // Arrange
    const { window, fill } = setup();

    // Act
    await window.render({ force: true });
    await window.render({ force: true });

    // Assert
    expect(fill).toHaveBeenCalledOnce();
    expect(
      document.querySelectorAll('link[href="/modules/m/styles/mixer.css"]'),
    ).toHaveLength(1);
  });

  it("lets go of the view when closed, and draws a new one next time", async () => {
    // Arrange
    const { window, fill, dispose } = setup();
    await window.render({ force: true });

    // Act
    await window.close();
    await window.render({ force: true });

    // Assert
    expect(dispose).toHaveBeenCalledOnce();
    expect(fill).toHaveBeenCalledTimes(2);
  });
});
