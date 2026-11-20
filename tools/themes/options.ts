// What `scripts/themes/shots.ts` is asked to shoot: its command line,
// checked, and the pictures that come of it.

/** The dock's placements a picture can be taken in, by their names in its menu. */
export const PLACEMENTS = {
  left: "Docked on the left",
  right: "Docked on the right",
  top: "Docked at the top",
  bottom: "Docked at the bottom",
  floating: "Floating",
  scattered: "Scattered over the screen",
} as const;
export type PlacementName = keyof typeof PLACEMENTS;

const LAYOUTS = ["grid", "focus"] as const;
export type LayoutName = (typeof LAYOUTS)[number];

/** A window lower than this shows no dock worth a picture. */
const LOWEST = 300;

export interface ShotOptions {
  /** The folder the pictures go to. */
  readonly out: string;
  /** The harness's `?module=`, e.g. "dock,dock-vines". */
  readonly modules: string;
  /** The theme's id; none for the dock's own look. */
  readonly theme: string;
  /** Stylesheets to try, added to the page after the theme's. */
  readonly css: readonly string[];
  /** A folder of trial pictures, served to those stylesheets as `/theme-shots/art/`. */
  readonly art: string | null;
  /** How many players besides the viewer, the window's heights, and where and how the dock is. */
  readonly players: readonly number[];
  readonly heights: readonly number[];
  readonly placements: readonly PlacementName[];
  readonly layouts: readonly LayoutName[];
  /** Pixels of picture per CSS pixel. */
  readonly scale: number;
}

export const USAGE = `Usage: node scripts/themes/shots.ts <folder for the pictures>
  [--modules dock,dock-vines] [--theme vines]
  [--css trial.css,more.css] [--art folder]
  [--players 2,8] [--heights 900,1080]
  [--placements ${Object.keys(PLACEMENTS).join(",")}] [--layouts grid,focus]
  [--scale 2]`;

export class OptionsError extends Error {
  override readonly name = "OptionsError";
}

const list = (value: string): readonly string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function numbers(
  option: string,
  value: string,
  least: number,
): readonly number[] {
  const parsed = list(value).map(Number);
  if (
    parsed.length === 0 ||
    !parsed.every((n) => Number.isInteger(n) && n >= least)
  )
    throw new OptionsError(
      `${option} takes whole numbers from ${String(least)}, e.g. ${option} ${String(least)},${String(least + 6)}`,
    );
  return parsed;
}

function among<T extends string>(
  option: string,
  value: string,
  known: readonly T[],
): readonly T[] {
  const given = list(value);
  const unknown = given.filter((item) => !known.some((k) => k === item));
  if (given.length === 0 || unknown.length > 0)
    throw new OptionsError(
      `${option}: no such ${unknown.join(", ") || "value"}; it takes ${known.join(", ")}`,
    );
  return given.filter((item): item is T => known.some((k) => k === item));
}

const DEFAULTS: Omit<ShotOptions, "out"> = {
  modules: "dock",
  theme: "",
  css: [],
  art: null,
  players: [2],
  heights: [900],
  placements: ["left"],
  layouts: ["grid"],
  scale: 2,
};

/** One `--option value` applied to the options so far. */
function withOption(
  options: ShotOptions,
  option: string,
  value: string,
): ShotOptions {
  switch (option) {
    case "--modules":
      return { ...options, modules: value };
    case "--theme":
      return { ...options, theme: value };
    case "--css":
      return { ...options, css: list(value) };
    case "--art":
      return { ...options, art: value };
    case "--players":
      return { ...options, players: numbers(option, value, 0) };
    case "--heights":
      return { ...options, heights: numbers(option, value, LOWEST) };
    case "--placements":
      return {
        ...options,
        placements: among(
          option,
          value,
          Object.keys(PLACEMENTS) as PlacementName[],
        ),
      };
    case "--layouts":
      return { ...options, layouts: among(option, value, LAYOUTS) };
    case "--scale":
      return { ...options, scale: numbers(option, value, 1)[0] ?? 2 };
    default:
      throw new OptionsError(`No such option ${option}\n${USAGE}`);
  }
}

/** The command line, checked; throws an `OptionsError` that says what is wrong. */
export function parseShotArgs(argv: readonly string[]): ShotOptions {
  const [out, ...rest] = argv;
  if (!out || out.startsWith("--"))
    throw new OptionsError(`Name a folder for the pictures.\n${USAGE}`);
  const pairs = rest.reduce<readonly (readonly [string, string | undefined])[]>(
    (found, word, i) => (i % 2 === 0 ? [...found, [word, rest[i + 1]]] : found),
    [],
  );
  return pairs.reduce<ShotOptions>(
    (options, [option, value]) => {
      if (value === undefined || value.startsWith("--"))
        throw new OptionsError(`${option} needs a value\n${USAGE}`);
      return withOption(options, option, value);
    },
    { out, ...DEFAULTS },
  );
}

/** One picture to take. */
export interface Shot {
  /** Its file's name, without the extension. */
  readonly name: string;
  readonly players: number;
  readonly height: number;
  readonly placement: PlacementName;
  readonly layout: LayoutName;
}

/** Every combination asked for, placements first: each a picture. */
export function shotsOf(options: ShotOptions): readonly Shot[] {
  return options.placements.flatMap((placement) =>
    options.layouts.flatMap((layout) =>
      options.players.flatMap((players) =>
        options.heights.map((height) => ({
          // The viewer's own camera is always there.
          name: `${placement}-${layout}-${String(players + 1)}-cameras-${String(height)}`,
          players,
          height,
          placement,
          layout,
        })),
      ),
    ),
  );
}
