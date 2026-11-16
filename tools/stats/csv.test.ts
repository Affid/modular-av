import { describe, expect, it } from "vitest";
import {
  DOWNLOADS_HEADER,
  TRAFFIC_HEADER,
  downloadRows,
  mergeDownloads,
  mergeTraffic,
} from "./csv.ts";

const RELEASES = [
  {
    tag_name: "modular-av-v0.13.2",
    assets: [
      { name: "modular-av.zip", download_count: 19 },
      { name: "module.json", download_count: 105 },
    ],
  },
  {
    tag_name: "modular-av-dock-v0.13.2",
    assets: [{ name: "modular-av-dock.zip", download_count: 15 }],
  },
];

describe("downloadRows", () => {
  it("gives one row per release file, sorted by tag then file", () => {
    expect(downloadRows(RELEASES)).toEqual([
      {
        tag: "modular-av-dock-v0.13.2",
        asset: "modular-av-dock.zip",
        downloads: 15,
      },
      { tag: "modular-av-v0.13.2", asset: "modular-av.zip", downloads: 19 },
      { tag: "modular-av-v0.13.2", asset: "module.json", downloads: 105 },
    ]);
  });

  it("throws on an answer that is not a list of releases", () => {
    expect(() => downloadRows({ message: "Bad credentials" })).toThrow(
      /releases/,
    );
    expect(() => downloadRows([{ name: "no tag" }])).toThrow(/release/);
    expect(() => downloadRows([{ tag_name: "x" }])).toThrow(/asset list/);
    expect(() => downloadRows([{ tag_name: "x", assets: [{}] }])).toThrow(
      /asset/,
    );
  });

  it("throws on a name that would break the CSV", () => {
    expect(() =>
      downloadRows([
        { tag_name: "x", assets: [{ name: "a,b", download_count: 1 }] },
      ]),
    ).toThrow(/asset name/);
    expect(() => downloadRows([{ tag_name: "", assets: [] }])).toThrow(
      /tag name/,
    );
  });

  it("throws on a name that would break the README's tables", () => {
    for (const name of ["a|b", "<b>", "a`b"]) {
      expect(() =>
        downloadRows([
          { tag_name: "x", assets: [{ name, download_count: 1 }] },
        ]),
      ).toThrow(/asset name/);
    }
  });

  it("throws when GitHub lists no release files, rather than wipe the day", () => {
    expect(() => downloadRows([])).toThrow(/no release files/);
    expect(() => downloadRows([{ tag_name: "x", assets: [] }])).toThrow(
      /no release files/,
    );
  });
});

describe("mergeDownloads", () => {
  const rows = downloadRows(RELEASES);

  it("starts a new file with its header", () => {
    expect(mergeDownloads("", rows, "2026-11-17").split("\n")).toEqual([
      DOWNLOADS_HEADER,
      "2026-11-17,modular-av-dock-v0.13.2,modular-av-dock.zip,15",
      "2026-11-17,modular-av-v0.13.2,modular-av.zip,19",
      "2026-11-17,modular-av-v0.13.2,module.json,105",
      "",
    ]);
  });

  it("adds a later day and keeps the earlier ones", () => {
    const first = mergeDownloads("", rows, "2026-11-17");
    const next = mergeDownloads(
      first,
      [{ tag: "modular-av-v0.13.2", asset: "modular-av.zip", downloads: 23 }],
      "2026-11-18",
    );
    expect(next.split("\n").slice(-2)).toEqual([
      "2026-11-18,modular-av-v0.13.2,modular-av.zip,23",
      "",
    ]);
    expect(next.split("\n")).toHaveLength(6);
  });

  it("replaces a day's rows when it runs again that day", () => {
    const first = mergeDownloads("", rows, "2026-11-17");
    const again = mergeDownloads(
      first,
      [{ tag: "modular-av-v0.13.2", asset: "modular-av.zip", downloads: 21 }],
      "2026-11-17",
    );
    expect(again.split("\n")).toEqual([
      DOWNLOADS_HEADER,
      "2026-11-17,modular-av-v0.13.2,modular-av.zip,21",
      "",
    ]);
  });
});

const day = (date: string, count: number, uniques: number) => ({
  timestamp: `${date}T00:00:00Z`,
  count,
  uniques,
});

describe("mergeTraffic", () => {
  it("writes one line per day, views and clones side by side", () => {
    const csv = mergeTraffic(
      "",
      { views: [day("2026-11-12", 9, 4), day("2026-11-13", 3, 2)] },
      { clones: [day("2026-11-13", 7, 5)] },
    );
    expect(csv.split("\n")).toEqual([
      TRAFFIC_HEADER,
      "2026-11-12,9,4,0,0",
      "2026-11-13,3,2,7,5",
      "",
    ]);
  });

  it("keeps days older than GitHub's 14, and takes GitHub's newer count", () => {
    const old = [
      TRAFFIC_HEADER,
      "2026-10-01,5,5,1,1",
      "2026-11-13,3,2,7,5",
      "",
    ].join("\n");
    const csv = mergeTraffic(
      old,
      { views: [day("2026-11-13", 8, 6)] },
      { clones: [] },
    );
    expect(csv.split("\n")).toEqual([
      TRAFFIC_HEADER,
      "2026-10-01,5,5,1,1",
      "2026-11-13,8,6,0,0",
      "",
    ]);
  });

  it("throws on an answer without daily counts", () => {
    expect(() =>
      mergeTraffic("", { message: "Not Found" }, { clones: [] }),
    ).toThrow(/views/);
    expect(() =>
      mergeTraffic("", { views: [{ timestamp: 1 }] }, { clones: [] }),
    ).toThrow(/views day/);
  });
});
