import { describe, expect, it } from "vitest";
import {
  change,
  fromFirstVisit,
  groupTotals,
  latestDownloads,
  moduleTotals,
  parseDownloads,
  parseTraffic,
} from "./series.ts";

const DOWNLOADS = `date,tag,asset,downloads
2026-11-17,dev,modular-av.zip,4
2026-11-17,modular-av-dock-v0.13.1,modular-av-dock.zip,8
2026-11-17,modular-av-dock-v0.13.2,modular-av-dock.zip,15
2026-11-17,modular-av-p2p-v0.13.2,modular-av-p2p.zip,10
2026-11-17,modular-av-v0.13.2,module.json,105
2026-11-17,modular-av-v0.13.2,modular-av.zip,19
2026-11-18,dev,modular-av.zip,1
2026-11-18,modular-av-dock-v0.13.1,modular-av-dock.zip,8
2026-11-18,modular-av-dock-v0.13.2,modular-av-dock.zip,17
2026-11-18,modular-av-p2p-v0.13.2,modular-av-p2p.zip,10
2026-11-18,modular-av-v0.13.2,module.json,140
2026-11-18,modular-av-v0.13.2,modular-av.zip,22
`;

describe("parseDownloads", () => {
  it("reads one line per file per day", () => {
    const lines = parseDownloads(DOWNLOADS);
    expect(lines).toHaveLength(12);
    expect(lines[1]).toEqual({
      date: "2026-11-17",
      tag: "modular-av-dock-v0.13.1",
      asset: "modular-av-dock.zip",
      downloads: 8,
    });
  });

  it("reads an empty file as no lines", () => {
    expect(parseDownloads("")).toEqual([]);
  });

  it("rejects a malformed line", () => {
    expect(() =>
      parseDownloads("date,tag,asset,downloads\n2026-11-17,x,y,many\n"),
    ).toThrow(/downloads line/);
  });
});

describe("moduleTotals", () => {
  const totals = moduleTotals(parseDownloads(DOWNLOADS));

  it("sums a module's zips over all its versions, day by day", () => {
    expect(totals.get("modular-av-dock")).toEqual([
      { date: "2026-11-17", value: 23 },
      { date: "2026-11-18", value: 25 },
    ]);
  });

  it("leaves out manifest lookups and the dev prerelease", () => {
    expect(totals.get("modular-av")?.map((p) => p.value)).toEqual([19, 22]);
  });

  it("counts zero on every day for a module with no release file", () => {
    expect(totals.get("modular-av-jitsi")).toEqual([
      { date: "2026-11-17", value: 0 },
      { date: "2026-11-18", value: 0 },
    ]);
  });
});

describe("groupTotals", () => {
  it("adds up the modules of each group", () => {
    const groups = groupTotals(moduleTotals(parseDownloads(DOWNLOADS)));
    expect(groups.get("services")?.map((p) => p.value)).toEqual([10, 10]);
    expect(groups.get("dock")?.map((p) => p.value)).toEqual([23, 25]);
    expect(groups.get("effects")?.map((p) => p.value)).toEqual([0, 0]);
  });
});

describe("latestDownloads", () => {
  it("keeps only the last day's lines", () => {
    const latest = latestDownloads(parseDownloads(DOWNLOADS));
    expect(latest).toHaveLength(6);
    expect(latest.every((l) => l.date === "2026-11-18")).toBe(true);
  });

  it("gives nothing for an empty file", () => {
    expect(latestDownloads([])).toEqual([]);
  });
});

describe("change", () => {
  const points = (values: readonly [string, number][]) =>
    values.map(([date, value]) => ({ date, value }));

  it("says the change over the last 7 days", () => {
    expect(
      change(
        points([
          ["2026-11-01", 5],
          ["2026-11-10", 10],
          ["2026-11-17", 14],
        ]),
      ),
    ).toBe("+4 in 7 days");
  });

  it("says since when while there is less history", () => {
    expect(
      change(
        points([
          ["2026-11-15", 10],
          ["2026-11-17", 12],
        ]),
      ),
    ).toBe("+2 since Nov 15");
  });

  it("compares with the day before when a week has no snapshot", () => {
    expect(
      change(
        points([
          ["2026-11-01", 3],
          ["2026-11-17", 3],
        ]),
      ),
    ).toBe("0 since Nov 1");
  });

  it("has nothing to say about a single day", () => {
    expect(change(points([["2026-11-17", 3]]))).toBeUndefined();
    expect(change([])).toBeUndefined();
  });
});

describe("parseTraffic", () => {
  it("reads views and clones per day", () => {
    expect(
      parseTraffic(
        "date,views,view_uniques,clones,clone_uniques\n2026-11-12,43,28,86,38\n",
      ),
    ).toEqual([
      {
        date: "2026-11-12",
        views: 43,
        viewUniques: 28,
        clones: 86,
        cloneUniques: 38,
      },
    ]);
  });

  it("rejects a malformed line", () => {
    expect(() =>
      parseTraffic("date,views,view_uniques,clones,clone_uniques\n2026,1,2\n"),
    ).toThrow(/traffic line/);
  });
});

describe("fromFirstVisit", () => {
  const quiet = {
    views: 0,
    viewUniques: 0,
    clones: 0,
    cloneUniques: 0,
  };

  it("drops the quiet days before the first visit", () => {
    const days = [
      { date: "2026-11-01", ...quiet },
      { date: "2026-11-02", ...quiet, clones: 1, cloneUniques: 1 },
      { date: "2026-11-03", ...quiet },
    ];
    expect(fromFirstVisit(days).map((d) => d.date)).toEqual([
      "2026-11-02",
      "2026-11-03",
    ]);
  });

  it("gives nothing when nobody visited", () => {
    expect(fromFirstVisit([{ date: "2026-11-01", ...quiet }])).toEqual([]);
  });
});
