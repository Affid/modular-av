import { describe, expect, it } from "vitest";
import { parseShotArgs, PLACEMENTS, shotsOf, wantsSample } from "./options.ts";

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
      states: [],
      viewer: [],
      docks: ["open"],
      widths: [300],
      trial: null,
    });
  });

  it("reads what each player is doing, in their order, and whether the viewer has left", () => {
    const options = parseShotArgs([
      "out",
      "--states",
      "muted+deafened+poor,speaking,-,camera-off+menu",
      "--viewer",
      "out",
    ]);

    expect(options.states).toEqual([
      ["muted", "deafened", "poor"],
      ["speaking"],
      [],
      ["camera-off", "menu"],
    ]);
    expect(options.viewer).toEqual(["out"]);
  });

  it("reads another module's badge as something a player shows", () => {
    const options = parseShotArgs(["out", "--states", "badge,muted+badge"]);

    expect(options.states).toEqual([["badge"], ["muted", "badge"]]);
  });

  it("reads the viewer's own states, which press the dock's buttons", () => {
    const options = parseShotArgs([
      "out",
      "--viewer",
      "muted+deafened+camera-off",
    ]);

    expect(options.viewer).toEqual(["muted", "deafened", "camera-off"]);
  });

  it("takes a viewer who is in the call as one doing nothing", () => {
    expect(parseShotArgs(["out", "--viewer", "in"]).viewer).toEqual([]);
  });

  it("reads the dock put away and its widths, as more pictures to take", () => {
    const options = parseShotArgs([
      "out",
      "--docks",
      "open,collapsed",
      "--widths",
      "300,480",
    ]);

    expect(options.docks).toEqual(["open", "collapsed"]);
    expect(options.widths).toEqual([300, 480]);
  });

  it("reads a trial theme, which is then the theme of the pictures", () => {
    const options = parseShotArgs([
      "out",
      "--trial",
      "moss:0.1,0.05,0.2,0.05",
      "--css",
      "moss.css",
    ]);

    expect(options.trial).toEqual({
      id: "moss",
      reach: { top: 0.1, right: 0.05, bottom: 0.2, left: 0.05 },
    });
    expect(options.theme).toBe("moss");
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
    ["a state no player has", ["out", "--states", "asleep"], /asleep/],
    ["a viewer neither in nor out", ["out", "--viewer", "away"], /away/],
    [
      "a viewer in the call and doing something",
      ["out", "--viewer", "in+muted"],
      /in stands alone/,
    ],
    [
      "a state the viewer can't be put in",
      ["out", "--viewer", "speaking"],
      /speaking/,
    ],
    ["a dock neither open nor collapsed", ["out", "--docks", "ajar"], /ajar/],
    ["a dock too narrow to be one", ["out", "--widths", "40"], /--widths/],
    ["a trial theme with a bad reach", ["out", "--trial", "moss:1,1"], /four/],
    [
      "a trial theme beside another theme",
      ["out", "--theme", "vines", "--trial", "moss"],
      /--trial.*--theme|--theme.*--trial/,
    ],
  ])("refuses %s", (_name, argv, message) => {
    expect(() => parseShotArgs(argv)).toThrow(message);
  });
});

describe("wantsSample", () => {
  it("asks the harness for its sample module only when a player shows a badge", () => {
    // The sample module adds a button and rows of its own to the dock.
    expect(wantsSample(parseShotArgs(["out", "--states", "muted"]))).toBe(
      false,
    );
    expect(
      wantsSample(parseShotArgs(["out", "--states", "-,muted+badge"])),
    ).toBe(true);
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
      dock: "open",
      width: 300,
    });
    expect(new Set(shots.map((shot) => shot.name)).size).toBe(8);
  });

  it("takes a picture more for each way the dock is put away and each width, and says so in its name", () => {
    const shots = shotsOf(
      parseShotArgs([
        "out",
        "--docks",
        "open,collapsed",
        "--widths",
        "300,480",
      ]),
    );

    expect(shots.map((shot) => shot.name)).toEqual([
      "left-grid-3-cameras-900",
      "left-grid-3-cameras-900-480w",
      "left-grid-3-cameras-900-collapsed",
      "left-grid-3-cameras-900-collapsed-480w",
    ]);
    expect(shots[3]).toMatchObject({ dock: "collapsed", width: 480 });
  });

  it("names every placement by its entry in the dock's menu", () => {
    expect(PLACEMENTS.left).toBe("Docked on the left");
    expect(Object.keys(PLACEMENTS).sort()).toEqual(
      ["bottom", "floating", "left", "right", "scattered", "top"].sort(),
    );
  });
});
