// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { listSpace } from "../src/cameras/list-space.ts";

afterEach(() => {
  document.body.replaceChildren();
});

function list(width: number, height: number, style: string): HTMLElement {
  const element = document.createElement("ul");
  element.setAttribute("style", style);
  Object.defineProperty(element, "clientWidth", { value: width });
  Object.defineProperty(element, "clientHeight", { value: height });
  document.body.append(element);
  return element;
}

describe("listSpace", () => {
  it("is the list's whole box when it has no padding", () => {
    expect(listSpace(list(300, 500, "column-gap: 6px"))).toEqual({
      width: 300,
      height: 500,
      gap: 6,
    });
  });

  it("leaves out a theme's padding: tiles fit inside it", () => {
    const space = listSpace(
      list(300, 500, "padding: 12px 10px 8px 4px; column-gap: 0px"),
    );

    expect(space).toEqual({ width: 286, height: 480, gap: 0 });
  });

  it("is never less than nothing", () => {
    expect(listSpace(list(10, 10, "padding: 12px"))).toEqual({
      width: 0,
      height: 0,
      gap: 0,
    });
  });
});
