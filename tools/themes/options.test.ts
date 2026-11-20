import { describe, expect, it } from "vitest";
import { parseShotArgs, PLACEMENTS, shotsOf } from "./options.ts";

describe("parseShotArgs", () => {
  it("takes the folder for the pictures and falls back on one docked picture of the dock's own look", () => {
    expect(parseShotArgs(["out"])).toEqual({
      out: "out",
      modules: "dock",
      theme: "",
      css: [],
      art: null,
      players: [2],
      heights: [900],
      placements: ["left"],
      layouts: ["grid"],
      scale: 2,
    });
  });

  it("reads a theme, trial stylesheets and pictures, and lists of what to shoot", () => {
    const options = parseShotArgs([
      "shots",
      "--modules",
      "dock,dock-vines",
      "--theme",
      "vines",
      "--css",
      "a.css,b.css",
      "--art",
      "mock/art",
      "--players",
      "2,8",
      "--heights",
      "800,1080",
      "--placements",
      "left,top",
      "--layouts",
      "grid,focus",
      "--scale",
      "1",
    ]);

    expect(options).toMatchObject({
      modules: "dock,dock-vines",
      theme: "vines",
      css: ["a.css", "b.css"],
      art: "mock/art",
      players: [2, 8],
      heights: [800, 1080],
      placements: ["left", "top"],
      layouts: ["grid", "focus"],
      scale: 1,
    });
  });

  it.each([
    ["no folder", [], /folder/],
    ["an option it doesn't know", ["out", "--colour", "red"], /--colour/],
    ["an option without a value", ["out", "--theme"], /--theme needs a value/],
    [
      "a placement the dock hasn't",
      ["out", "--placements", "ceiling"],
      /ceiling/,
    ],
    ["a layout the dock hasn't", ["out", "--layouts", "spiral"], /spiral/],
    ["players that aren't a number", ["out", "--players", "two"], /--players/],
    ["no players at all", ["out", "--players", "-1"], /--players/],
    [
      "a height too small to show a dock",
      ["out", "--heights", "20"],
      /--heights/,
    ],
  ])("refuses %s", (_name, argv, message) => {
    expect(() => parseShotArgs(argv)).toThrow(message);
  });
});

describe("shotsOf", () => {
  it("is one picture for each combination, named so they sort together", () => {
    const shots = shotsOf(
      parseShotArgs([
        "out",
        "--players",
        "2,8",
        "--placements",
        "left,top",
        "--layouts",
        "grid,focus",
      ]),
    );

    expect(shots).toHaveLength(8);
    expect(shots[0]).toEqual({
      name: "left-grid-3-cameras-900",
      players: 2,
      height: 900,
      placement: "left",
      layout: "grid",
    });
    expect(new Set(shots.map((shot) => shot.name)).size).toBe(8);
  });

  it("names every placement by its entry in the dock's menu", () => {
    expect(PLACEMENTS.left).toBe("Docked on the left");
    expect(Object.keys(PLACEMENTS).sort()).toEqual(
      ["bottom", "floating", "left", "right", "scattered", "top"].sort(),
    );
  });
});
