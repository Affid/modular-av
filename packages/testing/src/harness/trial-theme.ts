// A theme registered by the harness itself, for pictures of a look that
// has no module yet (`pnpm theme:shots --trial`): `?trial=<id>:<top>,
// <right>,<bottom>,<left>`. Its stylesheet is not a file here: whoever
// opens the page serves it at TRIAL_STYLESHEET.

/** How far a trial theme's frames reach past a tile, as fractions of its width. */
export interface TrialReach {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface TrialTheme {
  readonly id: string;
  readonly reach: TrialReach;
}

/** Where the trial theme's stylesheet is asked for, from the page's root. */
export const TRIAL_STYLESHEET = "modules/modular-av-trial/trial.css";

/** The dock's own limit on a reach. */
const MAX_REACH = 0.5;
const NO_REACH: TrialReach = { top: 0, right: 0, bottom: 0, left: 0 };

function parseReach(text: string): TrialReach {
  const sides = text.split(",").map(Number);
  const [top, right, bottom, left] = sides;
  if (
    sides.length !== 4 ||
    top === undefined ||
    right === undefined ||
    bottom === undefined ||
    left === undefined ||
    sides.some((side) => !Number.isFinite(side))
  )
    throw new Error(
      `A trial theme's reach is four numbers (top, right, bottom, left), not ${JSON.stringify(text)}`,
    );
  if (sides.some((side) => side < 0 || side > MAX_REACH))
    throw new Error(
      `A trial theme's reach is from 0 to ${String(MAX_REACH)} of a tile's width each side, not ${JSON.stringify(text)}`,
    );
  return { top, right, bottom, left };
}

/** `<id>` or `<id>:<top>,<right>,<bottom>,<left>`; throws saying what is wrong. */
export function parseTrialTheme(text: string): TrialTheme {
  const [id = "", reach] = text.split(":");
  if (!/^[a-z][a-z0-9-]*$/.test(id))
    throw new Error(
      `A trial theme's id is lower case letters, digits and dashes, starting with a letter, not ${JSON.stringify(id)}`,
    );
  return { id, reach: reach === undefined ? NO_REACH : parseReach(reach) };
}

/** The trial theme as the harness's `?trial=` takes it. */
export const trialParam = ({ id, reach }: TrialTheme): string =>
  `${id}:${[reach.top, reach.right, reach.bottom, reach.left].join(",")}`;
