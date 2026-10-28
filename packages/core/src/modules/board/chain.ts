import type { ModuleKind } from "@modular-av/api";
import { MODULE_ID } from "../../constants.ts";
import { pieceOf } from "../pieces.ts";
import { type Plan, withoutPiece, withPiece } from "../plan.ts";
import { runningOf, updatesFor } from "../steps.ts";
import type { BoardState } from "./state.ts";

/** Where a module sits in the call: what players send, to what they see. */
export type Stage = "effects" | "service" | "cameras" | "look";

export const STAGES: readonly Stage[] = [
  "effects",
  "service",
  "cameras",
  "look",
];

const STAGE_OF: Readonly<Record<ModuleKind, Stage>> = {
  effect: "effects",
  service: "service",
  ui: "cameras",
  theme: "look",
};

/** Choices that are no module: Foundry's own camera dock, the Dock's own look. */
export const BUILT_IN = {
  cameras: "built-in:cameras",
  look: "built-in:look",
} as const;

export type TileStatus = "running" | "off" | "missing" | "built-in" | "soon";

/** What going live does to a module: installed first, turned on, or off. */
export type PlanNote = "install" | "turnOn" | "turnOff" | null;

export interface Tile {
  readonly id: string;
  readonly stage: Stage;
  readonly status: TileStatus;
  readonly inChain: boolean;
  readonly note: PlanNote;
  /** What must be in the chain first (a theme's Dock), or null. */
  readonly locked: string | null;
  readonly update: boolean;
  /** Not in the catalog the core shipped with. */
  readonly isNew: boolean;
}

export const stageOf = (kind: ModuleKind): Stage => STAGE_OF[kind];

const uiOf = (state: BoardState): string | undefined =>
  [...state.plan].find((id) => pieceOf(state.pieces, id)?.kind === "ui");

/** The plan by stage, with the built-in choices where no module is chosen. */
export function chainOf(
  state: BoardState,
): Readonly<Record<Stage, readonly string[]>> {
  const of = (stage: Stage): string[] =>
    [...state.plan].filter((id) => {
      const piece = pieceOf(state.pieces, id);
      return piece !== undefined && stageOf(piece.kind) === stage;
    });
  const cameras = of("cameras");
  const look = of("look");
  return {
    effects: of("effects"),
    service: of("service"),
    cameras: cameras.length > 0 ? cameras : [BUILT_IN.cameras],
    look: cameras.length === 0 ? [] : look.length > 0 ? look : [BUILT_IN.look],
  };
}

const builtInOf = (stage: Stage): string | null =>
  stage === "cameras"
    ? BUILT_IN.cameras
    : stage === "look"
      ? BUILT_IN.look
      : null;

/** A stage's choices: the built-in one, its modules, then those coming soon. */
export function tilesOf(state: BoardState, stage: Stage): readonly Tile[] {
  const builtIn = builtInOf(stage);
  const modules = state.pieces
    .filter((p) => stageOf(p.kind) === stage)
    .map((p) => p.id);
  const soon = state.loaded.catalog.soon
    .filter((s) => s.kind !== "core" && stageOf(s.kind) === stage)
    .map((s) => s.id);
  return [...(builtIn ? [builtIn] : []), ...modules, ...soon].map((id) =>
    tileOf(state, id),
  );
}

function noteOf(state: BoardState, id: string): PlanNote {
  const planned = state.plan.has(id);
  const installed = state.world.get(id);
  if (planned && !installed) return "install";
  if (planned && !installed?.active) return "turnOn";
  if (!planned && runningOf(state.world).has(id)) return "turnOff";
  return null;
}

function builtInTile(state: BoardState, id: string): Tile {
  const stage: Stage = id === BUILT_IN.cameras ? "cameras" : "look";
  return {
    id,
    stage,
    status: "built-in",
    inChain: chainOf(state)[stage].includes(id),
    note: null,
    // The Dock's own look needs a Dock: the first camera display there is.
    locked:
      stage === "look" && uiOf(state) === undefined
        ? (state.pieces.find((p) => p.kind === "ui")?.id ?? null)
        : null,
    update: false,
    isNew: false,
  };
}

export function tileOf(state: BoardState, id: string): Tile {
  if (id === BUILT_IN.cameras || id === BUILT_IN.look)
    return builtInTile(state, id);
  const piece = pieceOf(state.pieces, id);
  const soon = state.loaded.catalog.soon.find((s) => s.id === id);
  const kind = piece?.kind ?? soon?.kind;
  const installed = state.world.get(id);
  const parent = piece?.requires.find((r) => r !== MODULE_ID) ?? null;
  return {
    id,
    stage: kind && kind !== "core" ? stageOf(kind) : "effects",
    status: !piece
      ? "soon"
      : installed?.active
        ? "running"
        : installed
          ? "off"
          : "missing",
    inChain: state.plan.has(id),
    note: piece ? noteOf(state, id) : null,
    locked:
      piece?.kind === "theme" && parent && !state.plan.has(parent)
        ? parent
        : null,
    update: updatesFor(state.world, state.loaded.catalog).includes(id),
    isNew: piece !== undefined && !state.loaded.known.has(id),
  };
}

export interface Choice {
  readonly plan: Plan;
  /** Taken out with it: the service it replaced, a Dock's theme. */
  readonly dropped: readonly string[];
  /** Brought in with it: the Dock a theme needs. */
  readonly added: readonly string[];
}

/**
 * The plan after choosing `id` in its stage: a service or camera display
 * replaces the one there, an effect toggles, a theme brings its Dock,
 * a built-in choice takes out the module it stands for.
 */
export function choose(state: BoardState, id: string): Choice {
  const { plan, pieces } = state;
  const unchanged: Choice = { plan, dropped: [], added: [] };
  const take = (out: string | undefined): Choice => {
    if (out === undefined) return unchanged;
    const next = withoutPiece(plan, out, pieces);
    return { plan: next.plan, dropped: next.removed, added: [] };
  };
  if (id === BUILT_IN.cameras) return take(uiOf(state));
  if (id === BUILT_IN.look)
    return take(chainOf(state).look.find((l) => l !== BUILT_IN.look));
  const piece = pieceOf(pieces, id);
  if (!piece) return unchanged;
  if (piece.kind === "effect" && plan.has(id)) return take(id);
  const parent = piece.requires.find((r) => r !== MODULE_ID);
  const needs = piece.kind === "theme" && parent && !plan.has(parent);
  const base = needs ? withPiece(plan, parent, pieces) : { plan, dropped: [] };
  const next = withPiece(base.plan, id, pieces);
  return {
    plan: next.plan,
    dropped: [...base.dropped, ...next.dropped],
    added: needs ? [parent] : [],
  };
}
