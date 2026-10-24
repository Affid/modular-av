// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePipWindow } from "../src/windows/pip-window.ts";

/** A second document standing in for the Picture-in-Picture window. */
function pipWindow(): Window {
  const doc = document.implementation.createHTMLDocument("");
  const target = new EventTarget();
  return Object.assign(target, { document: doc }) as unknown as Window;
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.body.className = "";
  document.documentElement.className = "";
});

describe("preparing the Picture-in-Picture window", () => {
  it("copies the page's style sheets and classes", () => {
    // Arrange
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://foundry.test/css/foundry.css";
    const style = document.createElement("style");
    style.textContent = ".mav-dock { color: red; }";
    document.head.append(link, style);
    document.body.className = "theme-dark";
    const win = pipWindow();

    // Act
    preparePipWindow(win, document, () => []);

    // Assert
    const head = win.document.head;
    expect(head.querySelector("link")?.getAttribute("href")).toBe(
      "https://foundry.test/css/foundry.css",
    );
    expect(head.textContent).toContain(".mav-dock");
    expect(win.document.body.className).toBe("theme-dark modular-av-pip");
  });

  it("follows style sheets added or removed later, and theme changes", async () => {
    const win = pipWindow();
    preparePipWindow(win, document, () => []);

    const theme = document.createElement("style");
    theme.textContent = ".vines { border: 1px solid green; }";
    document.head.append(theme);
    document.body.className = "theme-light";
    await settle();

    expect(win.document.head.textContent).toContain(".vines");
    expect(win.document.body.className).toBe("theme-light modular-av-pip");
    theme.remove();
    await settle();
    expect(win.document.head.textContent).not.toContain(".vines");
  });

  it("gives elements native tooltips from Foundry's, as text", () => {
    const win = pipWindow();
    preparePipWindow(win, document, () => []);
    const button = win.document.createElement("button");
    button.dataset.tooltip = "<b>Mute</b> yourself";
    const name = win.document.createElement("span");
    name.dataset.tooltipText = "<img src=x onerror=alert(1)>";
    win.document.body.append(button, name);

    button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    name.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));

    expect(button.title).toBe("Mute yourself");
    expect(name.title).toBe("<img src=x onerror=alert(1)>");
    expect(win.document.querySelector("img")).toBeNull();
  });

  it("forwards only the push to talk key to Foundry's window", () => {
    const win = pipWindow();
    preparePipWindow(win, document, () => ["Backquote"]);
    const keys = vi.fn<(event: KeyboardEvent) => void>();
    window.addEventListener("keydown", keys);

    win.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote" }));
    win.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
    window.removeEventListener("keydown", keys);

    expect(keys.mock.calls.map(([e]) => e.code)).toEqual(["Backquote"]);
  });

  it("stops following and forwarding once undone", async () => {
    const win = pipWindow();
    const undo = preparePipWindow(win, document, () => ["Backquote"]);
    const keys = vi.fn();
    window.addEventListener("keydown", keys);

    undo();
    win.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote" }));
    const late = document.createElement("style");
    late.textContent = ".late {}";
    document.head.append(late);
    await settle();
    window.removeEventListener("keydown", keys);

    expect(keys).not.toHaveBeenCalled();
    expect(win.document.head.textContent).not.toContain(".late");
  });
});
