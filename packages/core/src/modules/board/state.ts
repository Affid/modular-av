import type { BoardHost, LoadedCatalog, SavedPlan } from "../host.ts";
import type { Stage } from "./chain.ts";
import type { ObjectiveKey } from "./objectives.ts";
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
  /** The stage whose choices are open, or none. */
  readonly open: Stage | null;
  /** The tile shown in the inspect panel. */
  readonly selected: string | null;
  /** The step shown open; "none": the GM closed them all; null: the current one. */
  readonly panel: ObjectiveKey | "none" | null;
  readonly chatSent: boolean;
  /** Soundcheck's items the GM has opened, by id. */
  readonly checked: ReadonlySet<string>;
}

/** What runs, with only the service in use when several run. */
function runningPlan(
  host: BoardHost,
  world: WorldModules,
  pieces: readonly Piece[],
): Plan {
  const running = [...runningOf(world)];
  const isService = (id: string) =>
    pieces.some((p) => p.id === id && p.kind === "service");
  const inUse = host.serviceInUse();
  const keep =
    inUse !== null && running.includes(inUse) ? inUse : running.find(isService);
  return new Set(running.filter((id) => !isService(id) || id === keep));
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
      : runningPlan(host, world, pieces),
    history: [],
    trip: saved?.trip?.filter(knows) ?? null,
    confirming: null,
    open: null,
    selected: null,
    panel: null,
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
