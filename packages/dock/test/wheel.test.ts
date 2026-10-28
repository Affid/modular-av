// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { wheelSideways } from "../src/cameras/wheel.ts";

afterEach(() => {
  document.body.replaceChildren();
});

/** A strip 300 wide holding 900 of content. */
function strip(): HTMLElement {
  const element = document.createElement("ol");
  Object.defineProperty(element, "scrollWidth", { value: 900 });
  Object.defineProperty(element, "clientWidth", { value: 300 });
  document.body.append(element);
  return element;
}

const turn = (element: HTMLElement, init: WheelEventInit): WheelEvent => {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  // happy-dom drops a wheel event's modifier keys.
  if (init.ctrlKey) Object.defineProperty(event, "ctrlKey", { value: true });
  element.dispatchEvent(event);
  return event;
};

describe("wheelSideways", () => {
  it("scrolls an overflowing strip sideways with the wheel", () => {
    const element = strip();
    wheelSideways(element, () => true);

    const event = turn(element, { deltaY: 120 });

    expect(element.scrollLeft).toBe(120);
    expect(event.defaultPrevented).toBe(true);
  });

  it("counts a wheel that scrolls by lines in lines", () => {
    const element = strip();
    wheelSideways(element, () => true);

    turn(element, { deltaY: 3, deltaMode: 1 });

    expect(element.scrollLeft).toBe(48);
  });

  it("leaves zooming, sideways wheels and a strip not enabled alone", () => {
    const element = strip();
    let enabled = true;
    wheelSideways(element, () => enabled);

    const zoom = turn(element, { deltaY: 120, ctrlKey: true });
    const sideways = turn(element, { deltaX: 80, deltaY: 10 });
    enabled = false;
    const vertical = turn(element, { deltaY: 120 });

    expect(element.scrollLeft).toBe(0);
    expect([zoom, sideways, vertical].map((e) => e.defaultPrevented)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("stops once undone", () => {
    const element = strip();
    const undo = wheelSideways(element, () => true);

    undo();
    turn(element, { deltaY: 120 });

    expect(element.scrollLeft).toBe(0);
  });
});
