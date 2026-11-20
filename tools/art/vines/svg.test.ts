import { describe, expect, it } from "vitest";
import {
  idsOf,
  isWellFormed,
  linksOf,
  pathPoints,
  svgDocument,
} from "./svg.ts";

describe("svgDocument", () => {
  it("wraps a body in a picture that stretches with the frame layer", () => {
    const svg = svgDocument("<g/>");

    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1220 782\.5" preserveAspectRatio="none"><g\/><\/svg>\n$/,
    );
  });
});

describe("isWellFormed", () => {
  it.each([
    '<svg><g><path d="M0 0"/></g></svg>',
    '<svg><defs><clipPath id="a"><rect/></clipPath></defs><use href="#a"/></svg>',
  ])("accepts %s", (svg) => {
    expect(isWellFormed(svg)).toBe(true);
  });

  it.each([
    ["an element left open", "<svg><g><path/></svg>"],
    ["an element closed twice", "<svg><g/></g></svg>"],
    ["elements closed out of order", "<svg><g><defs></g></defs></svg>"],
    ["nothing at all", ""],
  ])("refuses %s", (_, svg) => {
    expect(isWellFormed(svg)).toBe(false);
  });
});

describe("idsOf, linksOf and pathPoints", () => {
  const svg =
    '<svg><defs><path id="sa" d="M1 2C3 4 5 6 7 8"/><filter id="f"/></defs><use href="#sa"/><g filter="url(#f)"/></svg>';

  it("lists what a picture defines and what it refers to", () => {
    expect(idsOf(svg)).toEqual(["sa", "f"]);
    expect(linksOf(svg)).toEqual(["sa", "f"]);
  });

  it("reads the points of the paths with an id prefix", () => {
    expect(pathPoints(svg, "s")).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]);
    expect(pathPoints(svg, "x")).toEqual([]);
  });
});
