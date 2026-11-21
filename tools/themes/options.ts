// What `scripts/themes/shots.ts` is asked to shoot: its command line,
// checked, and the pictures that come of it.
import {
  parseTrialTheme,
  type TrialTheme,
} from "../../packages/testing/src/harness/trial-theme.ts";

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

/**
 * What a player in a picture can be doing: the states a theme has to
 * show. `menu` puts the pointer over their camera, for its menu button.
 */
const STATES = [
  "speaking",
  "muted",
  "deafened",
  "poor",
  "camera-off",
  "menu",
] as const;
export type StateName = (typeof STATES)[number];

const VIEWERS = ["in", "out"] as const;
/** Whether the viewer is in the call; out of it, their own camera stays. */
export type ViewerState = (typeof VIEWERS)[number];

const DOCKS = ["open", "collapsed"] as const;
export type DockState = (typeof DOCKS)[number];

/** The docked dock's own width, and the narrowest one worth a picture. */
const DOCK_WIDTH = 300;
const NARROWEST = 200;

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
  /** What each player after the viewer is doing, in their order; none for the rest. */
  readonly states: readonly (readonly StateName[])[];
  readonly viewer: ViewerState;
  /** The dock open, put away, or a picture of each. */
  readonly docks: readonly DockState[];
  /** The docked dock's widths, in CSS pixels. */
  readonly widths: readonly number[];
  /** A theme registered for the pictures alone, with `css` as its stylesheet. */
  readonly trial: TrialTheme | null;
}

export const USAGE = `Usage: node scripts/themes/shots.ts <folder for the pictures>
  [--modules dock,dock-vines] [--theme vines]
  [--css trial.css,more.css] [--art folder]
  [--players 2,8] [--heights 900,1080]
  [--placements ${Object.keys(PLACEMENTS).join(",")}] [--layouts grid,focus]
  [--scale 2]
  [--states ${STATES.slice(0, 3).join("+")},speaking,-,camera-off+menu]
      what each player is doing, in their order: ${STATES.join(", ")}; - for nothing
  [--viewer ${VIEWERS.join("|")}] [--docks ${DOCKS.join(",")}] [--widths 300,480]
  [--trial id:top,right,bottom,left]
      a theme registered for these pictures, its stylesheet the --css files`;

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
  states: [],
  viewer: "in",
  docks: ["open"],
  widths: [DOCK_WIDTH],
  trial: null,
};

/** `muted+deafened,speaking,-`: each player's states, `-` for none. */
function statesOf(option: string, value: string): ShotOptions["states"] {
  return value.split(",").map((player) => {
    const named = player.trim();
    return named === "-" || named === ""
      ? []
      : among(option, named.replaceAll("+", ","), STATES);
  });
}

function trialOf(value: string): TrialTheme {
  try {
    return parseTrialTheme(value);
  } catch (error: unknown) {
    throw new OptionsError(
      `--trial: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

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
    case "--states":
      return { ...options, states: statesOf(option, value) };
    case "--viewer":
      return { ...options, viewer: among(option, value, VIEWERS)[0] ?? "in" };
    case "--docks":
      return { ...options, docks: among(option, value, DOCKS) };
    case "--widths":
      return { ...options, widths: numbers(option, value, NARROWEST) };
    case "--trial":
      return { ...options, trial: trialOf(value) };
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
  const options = pairs.reduce<ShotOptions>(
    (soFar, [option, value]) => {
      if (value === undefined || value.startsWith("--"))
        throw new OptionsError(`${option} needs a value\n${USAGE}`);
      return withOption(soFar, option, value);
    },
    { out, ...DEFAULTS },
  );
  if (!options.trial) return options;
  if (options.theme && options.theme !== options.trial.id)
    throw new OptionsError(
      `--trial ${options.trial.id} is the theme of the pictures: leave out --theme ${options.theme}`,
    );
  return { ...options, theme: options.trial.id };
}

/** One picture to take. */
export interface Shot {
  /** Its file's name, without the extension. */
  readonly name: string;
  readonly players: number;
  readonly height: number;
  readonly placement: PlacementName;
  readonly layout: LayoutName;
  readonly dock: DockState;
  /** The docked dock's width, in CSS pixels. */
  readonly width: number;
}

/** What a picture's name says beyond the usual: the dock put away, a width of its own. */
const suffix = (dock: DockState, width: number): string =>
  `${dock === "open" ? "" : `-${dock}`}${width === DOCK_WIDTH ? "" : `-${String(width)}w`}`;

/** Every combination asked for, placements first: each a picture. */
export function shotsOf(options: ShotOptions): readonly Shot[] {
  return options.placements.flatMap((placement) =>
    options.layouts.flatMap((layout) =>
      options.players.flatMap((players) =>
        options.heights.flatMap((height) =>
          options.docks.flatMap((dock) =>
            options.widths.map((width) => ({
              // The viewer's own camera is always there.
              name: `${placement}-${layout}-${String(players + 1)}-cameras-${String(height)}${suffix(dock, width)}`,
              players,
              height,
              placement,
              layout,
              dock,
              width,
            })),
          ),
        ),
      ),
    ),
  );
}
