import type { BoardHost, LoadedCatalog, SavedPlan } from "../host.ts";
import { type Piece, piecesOf } from "../pieces.ts";
import type { Plan } from "../plan.ts";
import { runningOf, type WorldModules } from "../steps.ts";

/** An inline confirmation open under its button, or none. */
export type Confirming = "leave" | "apply" | null;

/** Everything the board shows; replaced, never changed in place. */
export interface BoardState {
  readonly loaded: LoadedCatalog;
  readonly pieces: readonly Piece[];
  readonly world: WorldModules;
  readonly plan: Plan;
  readonly history: readonly Plan[];
  /** What was left to install when the GM left for Setup. */
  readonly trip: readonly string[] | null;
  readonly confirming: Confirming;
  readonly helperOpen: boolean;
  /** The helper's answer: a service module's id. */
  readonly answer: string | null;
  readonly chatSent: boolean;
  /** Soundcheck's items the GM has opened, by id. */
  readonly checked: ReadonlySet<string>;
}

/** The saved plan if there is one (pieces the catalog knows), else what runs. */
export function initialState(
  host: BoardHost,
  loaded: LoadedCatalog,
): BoardState {
  const pieces = piecesOf(loaded.catalog);
  const world = host.world();
  const saved: SavedPlan | null = host.savedPlan();
  const knows = (id: string): boolean => pieces.some((p) => p.id === id);
  // A running module the catalog doesn't list stays as it is.
  const unknown = [...runningOf(world)].filter((id) => !knows(id));
  return {
    loaded,
    pieces,
    world,
    plan: saved
      ? new Set([...saved.plan.filter(knows), ...unknown])
      : runningOf(world),
    history: [],
    trip: saved?.trip?.filter(knows) ?? null,
    confirming: null,
    helperOpen: false,
    answer: null,
    chatSent: false,
    checked: new Set(),
  };
}

/** What to keep in the world: nothing once the plan is what runs. */
export function toSave(state: BoardState): SavedPlan | null {
  const running = runningOf(state.world);
  const same =
    running.size === state.plan.size &&
    [...state.plan].every((id) => running.has(id));
  return same && state.trip === null
    ? null
    : { plan: [...state.plan], trip: state.trip };
}
