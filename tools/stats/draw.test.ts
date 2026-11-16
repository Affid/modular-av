import { describe, expect, it } from "vitest";
import { badge } from "./badge.ts";
import { barChart } from "./bars.ts";
import { summaryCard } from "./card.ts";
import { lineChart } from "./chart.ts";
import { THEMES } from "./svg.ts";

const days = (...values: number[]) =>
  values.map((value, i) => ({
    date: `2026-11-${String(10 + i).padStart(2, "0")}`,
    value,
  }));

describe("summaryCard", () => {
  const card = summaryCard(
    {
      title: "Modular A/V downloads",
      footnote: "Zip downloads from GitHub releases.",
      tiles: [
        { label: "Core", points: days(27, 39), slot: 0 },
        { label: "Dock", points: days(10), slot: 2 },
      ],
    },
    THEMES.dark,
  );

  it("shows each tile's total, change and colour", () => {
    expect(card).toContain(">Core</text>");
    expect(card).toContain(">39</text>");
    expect(card).toContain(">+12 since Nov 10</text>");
    expect(card).toContain(`fill="${THEMES.dark.good}">+12`);
    expect(card).toContain(">counting since Nov 10</text>");
    expect(card).toContain(`stroke="${THEMES.dark.series[2]}"`);
  });

  it("says when it was updated, with the footnote, in its theme", () => {
    expect(card).toContain(">Updated Nov 11, 2026</text>");
    expect(card).toContain(">Zip downloads from GitHub releases.</text>");
    expect(card).toContain(THEMES.dark.surface);
    expect(card).not.toContain(THEMES.light.surface);
  });

  it("draws a card with no data as zero", () => {
    const empty = summaryCard(
      {
        title: "T",
        footnote: "F",
        tiles: [{ label: "A", points: [], slot: 0 }],
      },
      THEMES.light,
    );
    expect(empty).toContain(">no data</text>");
    expect(empty).not.toContain("Updated");
  });
});

describe("lineChart", () => {
  it("draws a line and an end dot per series, with a legend naming each", () => {
    const svg = lineChart(
      {
        title: "Downloads so far",
        subtitle: "Day by day",
        lines: [
          { name: "Core", points: days(16, 18), slot: 0, legendValue: 18 },
          { name: "Starter set", points: days(10, 10), slot: undefined },
        ],
      },
      THEMES.light,
    );
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg).toContain(">Core<tspan");
    expect(svg).toContain(">18</tspan></text>");
    expect(svg).toContain(">Starter set</text>");
    expect(svg).toContain(`stroke="${THEMES.light.neutral}"`);
    expect(svg).toContain(">Nov 10, 2026</text>");
    expect(svg).toContain('aria-label="Downloads so far. Day by day"');
  });

  it("puts a single day's dots in the middle", () => {
    const svg = lineChart(
      {
        title: "T",
        subtitle: "S",
        lines: [{ name: "A", points: days(5), slot: 0 }],
        width: 400,
      },
      THEMES.light,
    );
    expect(svg).toMatch(/<circle cx="2\d\d(\.\d)?"/);
  });

  it("keeps a line's slot colour whatever its place", () => {
    const svg = lineChart(
      {
        title: "T",
        subtitle: "S",
        lines: [{ name: "Dock", points: days(1, 2), slot: 2 }],
      },
      THEMES.light,
    );
    expect(svg).toContain(`stroke="${THEMES.light.series[2]}"`);
    expect(svg).not.toContain(`stroke="${THEMES.light.series[0]}"`);
  });
});

describe("barChart", () => {
  const svg = barChart(
    {
      title: "Downloads by module",
      subtitle: "Zip downloads so far",
      legend: [
        { name: "Core", slot: 0 },
        { name: "Dock", slot: 2 },
      ],
      rows: [
        {
          label: "Core",
          group: "core",
          value: 133,
          slot: 0,
          note: "+4 in 7 days",
        },
        { label: "Dock", group: "dock", value: 106, slot: 2, note: undefined },
        {
          label: "Vines theme",
          group: "dock",
          value: 0,
          slot: 2,
          note: undefined,
        },
      ],
    },
    THEMES.light,
  );

  it("draws a bar per module with a value, and none for zero", () => {
    expect(svg.match(/<rect [^>]*rx="2"/g)).toHaveLength(2);
    expect(svg).toContain(">Vines theme</text>");
    expect(svg).toContain(">133<tspan");
    expect(svg).toContain(">+4 in 7 days</tspan>");
    expect(svg).toContain(">0</text>");
  });

  it("names every colour in a legend", () => {
    expect(svg).toContain(">Core</text>");
    expect(svg).toContain(">Dock</text>");
  });

  it("leaves a gap between groups", () => {
    const labelY = (name: string): number =>
      Number(
        new RegExp(
          `<text x="[\\d.]+" y="([\\d.]+)"[^>]*text-anchor="end">${name}</text>`,
        ).exec(svg)?.[1],
      );
    const betweenGroups = labelY("Dock") - labelY("Core");
    const withinGroup = labelY("Vines theme") - labelY("Dock");
    expect(withinGroup).toBeGreaterThan(0);
    expect(betweenGroups).toBeGreaterThan(withinGroup);
  });
});

describe("badge", () => {
  it("shows a module's downloads and change in its group colour", () => {
    const svg = badge(
      { points: days(100, 133), slot: 1, label: "Core downloads" },
      THEMES.light,
    );
    expect(svg).toContain(">downloads<tspan");
    expect(svg).toContain(">133</tspan>");
    expect(svg).toContain(">+33 since Nov 10</tspan>");
    expect(svg).toContain(`fill="${THEMES.light.good}"`);
    expect(svg).toContain(`stroke="${THEMES.light.series[1]}"`);
    expect(svg).toContain('aria-label="Core downloads: 133, +33 since Nov 10"');
  });

  it("leaves the change out while there is one day", () => {
    const svg = badge(
      { points: days(7), slot: undefined, label: "Dock downloads" },
      THEMES.dark,
    );
    expect(svg).toContain(">7</tspan></text>");
    expect(svg).toContain(THEMES.dark.surface);
  });
});
