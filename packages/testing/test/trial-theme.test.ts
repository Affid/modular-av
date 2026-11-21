import { describe, expect, it } from "vitest";
import {
  parseTrialTheme,
  TRIAL_STYLESHEET,
  trialParam,
} from "../src/harness/trial-theme.ts";

describe("a trial theme, registered in the harness for pictures of a look that has no module yet", () => {
  it("is an id and how far its frames reach past a tile: top, right, bottom, left", () => {
    expect(parseTrialTheme("scrolls:0.05,0.075,0.17,0.075")).toEqual({
      id: "scrolls",
      reach: { top: 0.05, right: 0.075, bottom: 0.17, left: 0.075 },
    });
  });

  it("may have no frames at all", () => {
    expect(parseTrialTheme("plain")).toEqual({
      id: "plain",
      reach: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  });

  it.each([
    ["", /id/],
    ["Scrolls:0,0,0,0", /id/],
    ["9lives", /id/],
    ["a:0.1,0.1,0.1", /four/],
    ["a:0.1,0.1,0.1,x", /four/],
    ["a:0.1,0.1,0.1,0.6", /0 to 0.5/],
    ["a:-0.1,0,0,0", /0 to 0.5/],
  ])("refuses %j", (text, why) => {
    expect(() => parseTrialTheme(text)).toThrow(why);
  });

  it("is written into the harness's address the way it is read", () => {
    const trial = parseTrialTheme("moss:0.1,0.2,0.3,0.4");

    expect(trialParam(trial)).toBe("moss:0.1,0.2,0.3,0.4");
    expect(parseTrialTheme(trialParam(trial))).toEqual(trial);
  });

  it("has its stylesheet where a module's would be, for whoever serves it", () => {
    expect(TRIAL_STYLESHEET).toBe("modules/modular-av-trial/trial.css");
  });
});
