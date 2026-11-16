import { describe, expect, it } from "vitest";
import { escapeXml, formatCount, formatDate } from "./format.ts";
import { THEMES, colorOf, dateTicks, niceTicks } from "./svg.ts";

describe("niceTicks", () => {
  it("steps by 1, 2 or 5 times a power of ten, from zero past the top", () => {
    expect(niceTicks(39)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(133)).toEqual([0, 50, 100, 150]);
  });

  it("never steps below 1", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(1)).toEqual([0, 1]);
  });
});

describe("dateTicks", () => {
  it("spaces dates evenly, never more than there are days", () => {
    expect(dateTicks("2026-11-13", "2026-11-13")).toEqual(["2026-11-13"]);
    expect(dateTicks("2026-11-13", "2026-11-14")).toEqual([
      "2026-11-13",
      "2026-11-14",
    ]);
    const month = dateTicks("2026-11-01", "2026-12-01");
    expect(month).toHaveLength(6);
    expect(month.at(-1)).toBe("2026-12-01");
  });
});

describe("formatting", () => {
  it("reads dates as month and day, with the year when asked", () => {
    expect(formatDate("2026-11-03")).toBe("Nov 3");
    expect(formatDate("2026-11-03", true)).toBe("Nov 3, 2026");
  });

  it("groups thousands", () => {
    expect(formatCount(12345)).toBe("12,345");
  });

  it("escapes text for XML", () => {
    expect(escapeXml(`<a & "b">`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
  });
});

describe("colorOf", () => {
  it("gives a slot its fixed colour, and no slot the neutral one", () => {
    expect(colorOf(2, THEMES.light)).toBe(THEMES.light.series[2]);
    expect(colorOf(undefined, THEMES.dark)).toBe(THEMES.dark.neutral);
    expect(colorOf(99, THEMES.dark)).toBe(THEMES.dark.neutral);
  });
});
