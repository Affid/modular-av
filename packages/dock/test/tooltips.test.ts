// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tooltipsAway } from "../src/ui/tooltips.ts";

beforeEach(() => {
  window.innerWidth = 1200;
  window.innerHeight = 800;
});

afterEach(() => {
  document.body.replaceChildren();
});

/** A dock with a toolbar of two buttons, the toolbar at `top`, `left`. */
function dock(top: number, left: number, column = false) {
  const root = document.createElement("section");
  const bar = document.createElement("div");
  bar.className = "mav-dock-buttons";
  if (column) bar.style.flexDirection = "column";
  const button = (label: string): HTMLButtonElement => {
    const made = document.createElement("button");
    made.dataset.tooltip = label;
    bar.append(made);
    return made;
  };
  const a = button("Mute");
  const b = button("Leave");
  bar.getBoundingClientRect = () =>
    ({
      top,
      left,
      width: column ? 40 : 200,
      height: column ? 200 : 40,
    }) as DOMRect;
  root.append(bar);
  document.body.append(root);
  const hide = vi.fn();
  tooltipsAway(root, hide);
  return { bar, a, b, hide };
}

const over = (target: Element): void => {
  target.dispatchEvent(new Event("pointerover", { bubbles: true }));
};

describe("the dock's tooltips", () => {
  it("open above a toolbar in the lower half of the screen, below one in the upper", () => {
    const low = dock(700, 20);
    over(low.a);
    expect(low.bar.dataset.tooltipDirection).toBe("UP");
    document.body.replaceChildren();

    const high = dock(20, 20);
    over(high.b);
    expect(high.bar.dataset.tooltipDirection).toBe("DOWN");
  });

  it("open beside a column of buttons, toward the middle of the screen", () => {
    const left = dock(100, 10, true);
    over(left.a);
    expect(left.bar.dataset.tooltipDirection).toBe("RIGHT");
    document.body.replaceChildren();

    const right = dock(100, 1150, true);
    over(right.a);
    expect(right.bar.dataset.tooltipDirection).toBe("LEFT");
  });

  it("go away when a button is clicked, so they don't cover what it opens", () => {
    const { a, hide } = dock(700, 20);

    a.click();

    expect(hide).toHaveBeenCalledTimes(1);
  });
});
