// Paints grown vines in a season's colours, as SVG that fills the frame layer.
import { at, blurFilter, curve, num, type Point, whole } from "./geometry.ts";
import type { Growth, Leaf } from "./growth.ts";
import { type Stem, tangent } from "./stems.ts";
import { leafDefs } from "./leaves.ts";
import { svgDocument } from "./svg.ts";

export type Season = "green" | "autumn" | "bare";

interface Palette {
  readonly leaves: readonly string[];
  readonly young: readonly string[];
  readonly stem: string;
  /** The light along a stem's upper side. */
  readonly stemLight: string;
  /** Thin shoots, tendrils and leaf stalks. */
  readonly shoot: string;
  /** Whether a leaf is still on the vine. */
  keeps(leaf: Leaf): boolean;
}

const all = (): boolean => true;

const PALETTES: Record<Season, Palette> = {
  green: {
    leaves: ["#3f7d2c", "#4b9434", "#2f6a2a", "#5fa53a", "#3a7a3f"],
    young: ["#78b548", "#8cc152"],
    stem: "#57522b",
    stemLight: "#a3a85a",
    shoot: "#6f8f3a",
    keeps: all,
  },
  autumn: {
    leaves: ["#b5651d", "#c9862b", "#a3401c", "#d29a3a", "#8a3b17"],
    young: ["#d9a441", "#c9862b"],
    stem: "#5a4426",
    stemLight: "#a98a55",
    shoot: "#5a4426",
    keeps: all,
  },
  bare: {
    leaves: ["#7a6a4c", "#6b5a40"],
    young: ["#857555"],
    stem: "#5b5145",
    stemLight: "#9a8f7c",
    shoot: "#5b5145",
    keeps: (leaf) => leaf.hardy < 0.14,
  },
};

const OUTLINE = "#1d1a0c";
const DEGREES = 180 / Math.PI;
/** Where shadows fall: the light comes from the top left. */
const LEAF_SHADOW: Point = [3, 6];
const STEM_SHADOW: Point = [4, 7];

/** The stretches of a stem that are in sight. */
function runs(stem: Stem): readonly Stem[] {
  const split = stem.reduce<readonly Stem[]>(
    (parts, sample) => {
      if (!sample.shown) return [...parts, []];
      const last = parts.at(-1) ?? [];
      return [...parts.slice(0, -1), [...last, sample]];
    },
    [[]],
  );
  return split.filter((run) => run.length > 2);
}

interface Ribbon {
  /** The stretch as a closed shape that tapers with the stem. */
  readonly outline: string;
  /** A line along its lit side. */
  readonly light: string;
  readonly width: number;
}

function ribbon(run: Stem): Ribbon {
  const kept = run
    .map((sample, i) => ({ ...sample, heading: tangent(run, i) }))
    .filter((_, i) => i % 2 === 0 || i === run.length - 1);
  const edge = (way: number): readonly Point[] =>
    kept.map((s) => [
      s.at[0] - (Math.sin(s.heading) * s.width * way) / 2,
      s.at[1] + (Math.cos(s.heading) * s.width * way) / 2,
    ]);
  const points = [...edge(1), ...edge(-1).toReversed()];
  const lit = kept.map((s): Point => [
    s.at[0] - s.width * 0.16,
    s.at[1] - s.width * 0.2,
  ]);
  return {
    outline: `M${points.map((p) => at(p, whole)).join("L")}Z`,
    light: `M${lit.map((p) => at(p, whole)).join("L")}`,
    width: kept[Math.floor(kept.length / 2)]?.width ?? 0,
  };
}

/** A thin shoot as one smooth line. */
const shootPath = (stem: Stem): string =>
  curve(
    stem
      .filter((_, i) => i % 3 === 0 || i === stem.length - 1)
      .map((s) => s.at),
    whole,
  );

/** Stems, shoots and the shadow they cast together. */
function stemArt(growth: Growth, palette: Palette): string {
  const ribbons = growth.stems.flatMap(runs).map(ribbon);
  const outlines = ribbons.map((r) => `<path d="${r.outline}"/>`).join("");
  const shoots = growth.shoots.map(shootPath).join("");
  const thin = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  return (
    `<g filter="url(#sb)" opacity=".5" transform="translate(${at(STEM_SHADOW)})">${outlines}<path d="${shoots}" fill="none" stroke="#000" stroke-width="3"/></g>` +
    `<g fill="${palette.stem}" stroke="${OUTLINE}" stroke-opacity=".7" stroke-width="1.2">${outlines}</g>` +
    `<g fill="none" stroke="${palette.stemLight}" stroke-opacity=".7" stroke-linecap="round">${ribbons.map((r) => `<path d="${r.light}" stroke-width="${num(r.width * 0.28)}"/>`).join("")}</g>` +
    `<path d="${shoots}" ${thin} stroke="${OUTLINE}" stroke-opacity=".7" stroke-width="4.4"/>` +
    `<path d="${shoots}" ${thin} stroke="${palette.shoot}" stroke-width="2.8"/>`
  );
}

/** A leaf over its shadow. */
function leafArt(leaf: Leaf, palette: Palette): string {
  const turn = `rotate(${whole(leaf.angle * DEGREES)}) scale(${(leaf.length / 100).toFixed(2)})`;
  const tones = leaf.young ? palette.young : palette.leaves;
  const fill = tones[leaf.tone % tones.length] ?? palette.stem;
  const shadow: Point = [
    leaf.base[0] + LEAF_SHADOW[0],
    leaf.base[1] + LEAF_SHADOW[1],
  ];
  return (
    `<use href="#${leaf.shape}-s" transform="translate(${at(shadow, whole)}) ${turn}" fill-opacity=".3"/>` +
    `<use href="#${leaf.shape}" transform="translate(${at(leaf.base, whole)}) ${turn}" fill="${fill}"/>`
  );
}

/** Leaf stalks, and the leaves, the largest at the back. */
function foliageArt(growth: Growth, palette: Palette): string {
  const kept = growth.leaves.filter((leaf) => palette.keeps(leaf));
  const bases = new Set(kept.map((leaf) => at(leaf.base)));
  const stalks = growth.stalks
    .filter(([, base]) => bases.has(at(base)))
    .map(([from, base]) => `M${at(from, whole)}L${at(base, whole)}`)
    .join("");
  const leaves = kept
    .toSorted((a, b) => b.length - a.length)
    .map((leaf) => leafArt(leaf, palette))
    .join("");
  return `<path d="${stalks}" fill="none" stroke="${palette.shoot}" stroke-width="3" stroke-linecap="round"/>${leaves}`;
}

const BLUR = blurFilter("sb", 3);

/** The whole plant in a season: stems, shoots and leaves. */
export const paintVines = (growth: Growth, season: Season): string =>
  svgDocument(
    `<defs>${leafDefs()}${BLUR}</defs>` +
      stemArt(growth, PALETTES[season]) +
      foliageArt(growth, PALETTES[season]),
  );

/**
 * Only the leaves and their stalks in a season, to lay over the whole plant
 * of another: each leaf covers the one under it.
 */
export const paintFoliage = (growth: Growth, season: Season): string =>
  svgDocument(
    `<defs>${leafDefs()}</defs>${foliageArt(growth, PALETTES[season])}`,
  );
