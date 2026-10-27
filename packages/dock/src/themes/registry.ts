import type {
  FrameDefinition,
  SuggestedLayout,
  ThemeDefinition,
  ThemeRegistry,
} from "./types.ts";
import { DOCK_REGISTER_HOOK } from "./types.ts";

/** The dock's own look, which every theme restyles. */
export const DEFAULT_THEME = "default";

export const MAX_REACH = 0.5;

const ID = /^[a-z][a-z0-9-]{0,39}$/;
const SEGMENT = /^[\w.-]+$/;
const LAYOUTS: readonly SuggestedLayout[] = ["docked", "floating", "scattered"];

export class ThemeError extends Error {
  override readonly name = "ThemeError";
}

/** A path under Foundry's root: no scheme, no host, no climbing out. */
function isLocalPath(path: unknown, extensions: RegExp): path is string {
  return (
    typeof path === "string" &&
    extensions.test(path) &&
    path.split("/").every((s) => SEGMENT.test(s) && s !== "." && s !== "..")
  );
}

const isReach = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_REACH;

type Loose = Readonly<Record<string, unknown>>;

const isLoose = (value: unknown): value is Loose =>
  typeof value === "object" && value !== null;

const SIDES = ["top", "right", "bottom", "left"] as const;

function checkFrames(id: string, frames: unknown): FrameDefinition | undefined {
  if (frames === undefined) return undefined;
  const reach = isLoose(frames) ? frames.reach : undefined;
  if (!isLoose(reach) || !SIDES.every((side) => isReach(reach[side])))
    throw new ThemeError(
      `Theme "${id}": frames.reach needs top, right, bottom and left from 0 to ${String(MAX_REACH)}`,
    );
  const [top, right, bottom, left] = SIDES.map((side) => Number(reach[side]));
  return {
    reach: Object.freeze({
      top: top ?? 0,
      right: right ?? 0,
      bottom: bottom ?? 0,
      left: left ?? 0,
    }),
  };
}

const isLayout = (value: unknown): value is SuggestedLayout =>
  LAYOUTS.some((layout) => layout === value);

/**
 * A theme as registered, checked and frozen; throws on a mistake. Theme
 * modules are plain JavaScript: every field is checked as unknown.
 */
export function checkTheme(theme: ThemeDefinition): ThemeDefinition {
  const t: unknown = theme;
  if (!isLoose(t)) throw new ThemeError("A theme must be an object");
  const { id, label, stylesheet, preview, suggestedLayout } = t;
  if (typeof id !== "string" || !ID.test(id) || id === DEFAULT_THEME)
    throw new ThemeError(
      `Theme id "${String(id)}": lower case letters, digits and dashes, starting with a letter, not "${DEFAULT_THEME}"`,
    );
  if (typeof label !== "string" || label.trim() === "")
    throw new ThemeError(`Theme "${id}" needs a label`);
  if (!isLocalPath(stylesheet, /\.css$/))
    throw new ThemeError(
      `Theme "${id}": stylesheet must be a .css path from Foundry's root, e.g. "modules/<module>/theme.css"`,
    );
  if (preview !== undefined && !isLocalPath(preview, /\.(webp|png|jpe?g|svg)$/))
    throw new ThemeError(
      `Theme "${id}": preview must be an image path from Foundry's root`,
    );
  if (suggestedLayout !== undefined && !isLayout(suggestedLayout))
    throw new ThemeError(
      `Theme "${id}": no such layout ${JSON.stringify(suggestedLayout)}`,
    );
  const frames = checkFrames(id, t.frames);
  return Object.freeze({
    id,
    label,
    stylesheet,
    ...(frames ? { frames } : {}),
    ...(preview === undefined ? {} : { preview }),
    ...(suggestedLayout === undefined ? {} : { suggestedLayout }),
  });
}

export interface OpenRegistry extends ThemeRegistry {
  /** Opens registration for the hook, then closes it for good. */
  run(fire: () => void): void;
}

/** The themes registry: open only during the dock's register hook. */
export function createThemeRegistry(): OpenRegistry {
  let phase: "before" | "open" | "closed" = "before";
  let themes: readonly ThemeDefinition[] = [];
  return {
    register(theme) {
      const loose: unknown = theme;
      const id = isLoose(loose) ? String(loose.id) : "?";
      if (phase !== "open")
        throw new ThemeError(
          `Theme "${id}": register it synchronously inside the "${DOCK_REGISTER_HOOK}" hook`,
        );
      const checked = checkTheme(theme);
      if (themes.some((t) => t.id === checked.id))
        throw new ThemeError(`Theme "${checked.id}" is registered already`);
      themes = [...themes, checked];
    },
    list: () => themes,
    get: (id) => themes.find((t) => t.id === id),
    run(fire) {
      phase = "open";
      try {
        fire();
      } finally {
        phase = "closed";
      }
    },
  };
}
