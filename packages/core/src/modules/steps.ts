import type { Catalog } from "../catalog/catalog.ts";
import { MODULE_ID } from "../constants.ts";
import { type Piece, pieceOf } from "./pieces.ts";
import type { Plan } from "./plan.ts";

/** The family modules installed in this Foundry, by id (the core too). */
export type WorldModules = ReadonlyMap<
  string,
  { readonly active: boolean; readonly version: string }
>;

export interface PlanDiff {
  readonly turnOn: readonly string[];
  readonly turnOff: readonly string[];
  /** Of `turnOn`, those not installed yet. */
  readonly install: readonly string[];
}

export interface Applicable {
  /** Installed, with what they need: Apply turns them on. */
  readonly on: readonly string[];
  readonly off: readonly string[];
  /** Running services that stay on until their replacement is installed. */
  readonly keep: readonly string[];
  /** Planned, but not installed yet (or what they need isn't). */
  readonly waiting: readonly string[];
}

/** The running pieces: the core is the board, never in a plan. */
export const runningOf = (world: WorldModules): Plan =>
  new Set(
    [...world]
      .filter(([id, w]) => w.active && id !== MODULE_ID)
      .map(([id]) => id),
  );

export function planDiff(plan: Plan, world: WorldModules): PlanDiff {
  const running = runningOf(world);
  const turnOn = [...plan].filter((id) => !running.has(id));
  return {
    turnOn,
    turnOff: [...running].filter((id) => !plan.has(id)),
    install: turnOn.filter((id) => !world.has(id)),
  };
}

/** Installed, with what it needs installed and planned, and a core it can run on. */
function readyIn(plan: Plan, world: WorldModules, pieces: readonly Piece[]) {
  const core = world.get(MODULE_ID)?.version;
  return (id: string): boolean => {
    const piece = pieceOf(pieces, id);
    const needs = (piece?.requires ?? []).filter((r) => r !== MODULE_ID);
    const coreOk =
      !piece?.needsCore ||
      core === undefined ||
      !isNewer(piece.needsCore, core);
    return (
      world.has(id) && coreOk && needs.every((r) => plan.has(r) && world.has(r))
    );
  };
}

/**
 * What Apply may change now, never leaving the world worse off: a piece
 * turns on only when it and what it needs are installed (and the core is
 * new enough), and the running service turns off only once another one
 * takes over: never for a plan without a service.
 */
export function applicable(
  plan: Plan,
  world: WorldModules,
  pieces: readonly Piece[],
): Applicable {
  const { turnOn, turnOff } = planDiff(plan, world);
  const on = turnOn.filter(readyIn(plan, world, pieces));
  const isService = (id: string) => pieceOf(pieces, id)?.kind === "service";
  const next = [...plan].find(isService);
  const canTakeOver =
    next !== undefined && (on.includes(next) || runningOf(world).has(next));
  const keep = canTakeOver ? [] : turnOff.filter(isService);
  return {
    on,
    off: turnOff.filter((id) => !keep.includes(id)),
    keep,
    waiting: turnOn.filter((id) => !on.includes(id)),
  };
}

/** The fewest links to paste on Setup: a piece another one requires comes with it. */
export function linksFor(
  ids: readonly string[],
  pieces: readonly Piece[],
): readonly { readonly id: string; readonly brings: readonly string[] }[] {
  const needs = (id: string) =>
    (pieceOf(pieces, id)?.requires ?? []).filter((r) => ids.includes(r));
  const brought = new Set(ids.flatMap(needs));
  return ids
    .filter((id) => !brought.has(id))
    .map((id) => ({ id, brings: needs(id) }));
}

const parts = (version: string): readonly number[] =>
  version.split("-")[0]?.split(".").map(Number) ?? [];

/** Whether `a` is a newer version than `b` (a prerelease before its release). */
export function isNewer(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return !a.includes("-") && b.includes("-");
}

/** Installed modules with a newer version in the catalog, the core first. */
export const updatesFor = (
  world: WorldModules,
  catalog: Catalog,
): readonly string[] =>
  catalog.modules
    .filter((m) => {
      const installed = world.get(m.id);
      return installed !== undefined && isNewer(m.version, installed.version);
    })
    .map((m) => m.id);
