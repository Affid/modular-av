import type { SettingsTab, SettingsWindowTab } from "@modular-av/api";
import { pieceOf } from "../pieces.ts";
import { applicable, planDiff, runningOf } from "../steps.ts";
import type { BoardState } from "./state.ts";

export type ObjectiveKey = "load" | "live" | "check";

/** Blocked (no service yet), to do, waiting on another, later, or done. */
export type ObjectiveState = "blocked" | "todo" | "waiting" | "later" | "done";

export interface Objective {
  readonly key: ObjectiveKey;
  readonly state: ObjectiveState;
  /** Installed of what the trip to Setup was for, or null. */
  readonly progress: readonly [number, number] | null;
}

/** A module's settings section, as Soundcheck lists it. */
export interface SectionInfo {
  readonly id: string;
  readonly moduleId: string;
  readonly label: string;
  /** The settings window's tab it is on; null: More. */
  readonly tab: SettingsTab | null;
}

/** Where checking it opens: the settings window on a tab, or Foundry's own on a module. */
export type CheckTarget =
  { readonly tab: SettingsWindowTab } | { readonly foundry: string };

/** One thing to check once the modules run. */
export interface Check {
  readonly id: string;
  readonly kind: "foundry" | "section" | "theme" | "effects";
  /** A section's name; empty for the others, named by their modules. */
  readonly label: string;
  readonly modules: readonly string[];
  /** What opens for it; null: nothing to open, only to know. */
  readonly target: CheckTarget | null;
  /** Its module isn't on air yet. */
  readonly locked: boolean;
}

const hasService = (state: BoardState): boolean =>
  [...state.plan].some((id) => pieceOf(state.pieces, id)?.kind === "service");

/**
 * The planned modules' settings (Foundry's own, set in its settings
 * window, and their sections in ours), their theme and their effects,
 * locked until on air.
 */
export function checksOf(
  state: BoardState,
  sections: readonly SectionInfo[],
  configured: readonly string[],
): readonly Check[] {
  const running = runningOf(state.world);
  const planned = [...state.plan];
  const kindOf = (id: string) => pieceOf(state.pieces, id)?.kind;
  const one = (
    id: string,
    kind: Check["kind"],
    modules: readonly string[],
    target: CheckTarget | null,
    label = "",
  ): Check => ({
    id,
    kind,
    label,
    modules,
    target,
    locked: !modules.every((m) => running.has(m)),
  });
  const foundry = configured
    .filter((id) => state.plan.has(id))
    .map((id) => one(`foundry:${id}`, "foundry", [id], { foundry: id }));
  const own = sections
    .filter((s) => state.plan.has(s.moduleId))
    .map((s) =>
      one(
        `section:${s.id}`,
        "section",
        [s.moduleId],
        { tab: s.tab ?? "more" },
        s.label,
      ),
    );
  const themes = planned.filter((id) => kindOf(id) === "theme");
  const effects = planned.filter((id) => kindOf(id) === "effect");
  return [
    ...foundry,
    ...own,
    ...(themes.length
      ? [one("theme", "theme", themes, { tab: "appearance" })]
      : []),
    ...(effects.length ? [one("effects", "effects", effects, null)] : []),
  ];
}

function loadState(state: BoardState): ObjectiveState {
  if (!hasService(state)) return "blocked";
  return planDiff(state.plan, state.world).install.length > 0 ? "todo" : "done";
}

function liveState(state: BoardState): ObjectiveState {
  if (!hasService(state)) return "blocked";
  const a = applicable(state.plan, state.world, state.pieces);
  if (a.on.length + a.off.length > 0) return "todo";
  const diff = planDiff(state.plan, state.world);
  return diff.turnOn.length + diff.turnOff.length > 0 ? "waiting" : "done";
}

function checkState(
  state: BoardState,
  live: ObjectiveState,
  checks: readonly Check[],
): ObjectiveState {
  const onAir = [...runningOf(state.world)].some(
    (id) => pieceOf(state.pieces, id)?.kind === "service",
  );
  if (live !== "done" || !onAir) return "later";
  const open = checks.filter(
    (c) => c.target !== null && !state.checked.has(c.id),
  );
  return open.length > 0 ? "todo" : "done";
}

export function objectivesOf(
  state: BoardState,
  checks: readonly Check[],
): readonly Objective[] {
  const trip = state.trip;
  const live = liveState(state);
  return [
    {
      key: "load",
      state: loadState(state),
      progress: trip
        ? [trip.filter((id) => state.world.has(id)).length, trip.length]
        : null,
    },
    { key: "live", state: live, progress: null },
    { key: "check", state: checkState(state, live, checks), progress: null },
  ];
}

/**
 * The step to show first: Load in until it's done, except back from
 * Setup with something to go live with; then Go live, then Soundcheck.
 */
export function currentOf(
  objectives: readonly Objective[],
  state: BoardState,
): ObjectiveKey | null {
  const of = (key: ObjectiveKey) =>
    objectives.find((o) => o.key === key)?.state;
  const load = of("load");
  const live = of("live");
  if (load === "todo" && state.trip && live === "todo") return "live";
  if (load === "blocked" || load === "todo") return "load";
  if (live === "todo") return "live";
  return of("check") === "todo" ? "check" : null;
}
