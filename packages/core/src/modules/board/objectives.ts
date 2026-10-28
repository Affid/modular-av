import type { SettingsTab } from "@modular-av/api";
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

export type CheckTab = SettingsTab | "more";

/** One thing to check once the modules run. */
export interface Check {
  readonly id: string;
  readonly kind: "section" | "theme" | "effects";
  /** The section's name, or the theme's or effects' module ids. */
  readonly label: string;
  readonly modules: readonly string[];
  /** Where the settings window opens for it; null: nothing to open. */
  readonly tab: CheckTab | null;
  /** Its module isn't on air yet. */
  readonly locked: boolean;
}

const hasService = (state: BoardState): boolean =>
  [...state.plan].some((id) => pieceOf(state.pieces, id)?.kind === "service");

/** The planned modules' settings, theme and effects, locked until on air. */
export function checksOf(
  state: BoardState,
  sections: readonly SectionInfo[],
): readonly Check[] {
  const running = runningOf(state.world);
  const kindOf = (id: string) => pieceOf(state.pieces, id)?.kind;
  const planned = [...state.plan];
  const own = sections
    .filter((s) => state.plan.has(s.moduleId))
    .map((s): Check => ({
      id: `section:${s.id}`,
      kind: "section",
      label: s.label,
      modules: [s.moduleId],
      tab: s.tab ?? "more",
      locked: !running.has(s.moduleId),
    }));
  const themes = planned.filter((id) => kindOf(id) === "theme");
  const effects = planned.filter((id) => kindOf(id) === "effect");
  const group = (kind: "theme" | "effects", ids: readonly string[]): Check[] =>
    ids.length === 0
      ? []
      : [
          {
            id: kind,
            kind,
            label: "",
            modules: ids,
            tab: kind === "theme" ? "appearance" : null,
            locked: !ids.every((id) => running.has(id)),
          },
        ];
  return [...own, ...group("theme", themes), ...group("effects", effects)];
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
  const open = checks.filter((c) => c.tab !== null && !state.checked.has(c.id));
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
