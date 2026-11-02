import type { ModularAV } from "@modular-av/api";
import type { Writer } from "../model/queue.ts";
import { runPlan } from "./run-plan.ts";
import {
  captureSnapshot,
  matchesSnapshot,
  parseSnapshot,
  planSnapshot,
  type Snapshot,
} from "../model/snapshot.ts";

export const MAX_PRESETS = 32;
export const MAX_NAME = 64;

export interface Preset extends Snapshot {
  readonly id: string;
  readonly name: string;
}

export type PresetProblem = "empty-name" | "long-name" | "full";

/** A name or a count a preset can't have. */
export class PresetError extends Error {
  override readonly name = "PresetError";
  readonly reason: PresetProblem;
  constructor(reason: PresetProblem) {
    super(`The preset can't be saved: ${reason}`);
    this.reason = reason;
  }
}

/** Where presets live: a fake in tests, a user's flags in Foundry. */
export interface PresetStore {
  /** Each preset's JSON, by id; anything could be there. */
  read(): Readonly<Record<string, unknown>>;
  write(id: string, json: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** "" for none. */
  activeId(): string;
  setActiveId(id: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface PresetSkips {
  readonly missing: readonly string[];
  readonly unsupported: readonly string[];
}

export interface PresetsDeps {
  readonly api: Pick<
    ModularAV,
    "state" | "commands" | "effects" | "contributions"
  >;
  readonly store: PresetStore;
  readonly writes: Writer;
  readonly newId: () => string;
  /** A GM's layers on top of the channel, once loaded. */
  readonly layers?: PresetLayers;
}

/** How a preset gets along with what a GM's layer holds. */
export interface PresetLayers {
  takeHeld(snapshot: Snapshot): Promise<Snapshot>;
  free(snapshot: Snapshot): Snapshot;
  underneath(snapshot: Snapshot): Snapshot;
}

export interface Presets {
  /** By name; what doesn't read as a preset isn't listed. */
  list(): readonly Preset[];
  active(): Preset | null;
  /** Whether the channel moved off the active preset. */
  changed(): boolean;
  /** What the last preset applied couldn't. */
  skipped(): PresetSkips;
  /** Replaces a preset of that name, whatever its case. */
  saveAs(name: string): Promise<Preset>;
  remove(id: string): Promise<void>;
  apply(id: string): Promise<void>;
  /** The next or previous by name, wrapping; null without any. */
  step(by: 1 | -1): Promise<Preset | null>;
  subscribe(listener: () => void): () => void;
}

function parsePreset(id: string, json: unknown): Preset | null {
  if (typeof json !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    // Not what this module wrote.
    return null;
  }
  const snapshot = parseSnapshot(value);
  const name = (value as { name?: unknown } | null)?.name;
  if (!snapshot || typeof name !== "string" || !name) return null;
  return { ...snapshot, id, name };
}

const NOTHING_SKIPPED: PresetSkips = { missing: [], unsupported: [] };

const sameName = (a: string, b: string): boolean =>
  a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

function checkName(name: string, known: boolean, count: number): void {
  if (!name) throw new PresetError("empty-name");
  if (name.length > MAX_NAME) throw new PresetError("long-name");
  if (!known && count >= MAX_PRESETS) throw new PresetError("full");
}

export function createPresets(deps: PresetsDeps): Presets {
  const { api, store, writes } = deps;
  let skipped = NOTHING_SKIPPED;
  let listeners: readonly (() => void)[] = [];

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  store.subscribe(notify);

  const contributions = () => api.contributions.list();
  const list = (): readonly Preset[] =>
    Object.entries(store.read())
      .flatMap(([id, json]) => parsePreset(id, json) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name));
  const find = (id: string): Preset | null =>
    list().find((p) => p.id === id) ?? null;
  const active = (): Preset | null => find(store.activeId());

  const apply = (id: string): Promise<void> =>
    writes.run("preset", async () => {
      const preset = find(id);
      if (!preset) return;
      const free = deps.layers ? await deps.layers.takeHeld(preset) : preset;
      const plan = planSnapshot(
        free,
        api.effects.list(),
        api.state.get().local,
        contributions(),
      );
      await runPlan(api.commands, plan);
      skipped = { missing: plan.missing, unsupported: plan.unsupported };
      await store.setActiveId(id);
      notify();
    });

  return {
    list,
    active,
    apply,
    changed() {
      const preset = active();
      return (
        preset !== null &&
        !matchesSnapshot(
          deps.layers?.free(preset) ?? preset,
          api.effects.list(),
          api.state.get().local,
          contributions(),
        )
      );
    },
    skipped: () => skipped,
    async saveAs(given) {
      const name = given.trim();
      const all = list();
      const known = all.find((p) => sameName(p.name, name));
      checkName(name, known !== undefined, Object.keys(store.read()).length);
      const id = known?.id ?? deps.newId();
      const captured = captureSnapshot(
        api.effects.list(),
        api.state.get().local,
        contributions(),
      );
      const snapshot = deps.layers?.underneath(captured) ?? captured;
      await store.write(id, JSON.stringify({ name, ...snapshot }));
      await store.setActiveId(id);
      skipped = NOTHING_SKIPPED;
      notify();
      return { ...snapshot, id, name };
    },
    async remove(id) {
      await store.remove(id);
      if (store.activeId() === id) await store.setActiveId("");
      notify();
    },
    async step(by) {
      const all = list();
      if (all.length === 0) return null;
      const at = all.findIndex((p) => p.id === store.activeId());
      const from = at < 0 && by < 0 ? 0 : at;
      const next = all[(from + by + all.length) % all.length];
      if (!next) return null;
      await apply(next.id);
      return next;
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
