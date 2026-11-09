import type { ModularAV } from "@modular-av/api";
import type { Writer } from "../model/queue.ts";
import {
  captureSnapshot,
  planSnapshot,
  type Snapshot,
} from "../model/snapshot.ts";
import { runPlan } from "../presets/run-plan.ts";
import {
  type Layer,
  mergeLayers,
  parseLayer,
  parseUndo,
  reconcileStep,
  splitHeld,
  type UndoRecord,
  underneath,
} from "./layer.ts";

export type LayerState = "applied" | "partly" | "refused" | "kept-out";

export interface LayerStatus {
  readonly id: string;
  readonly label: string;
  readonly state: LayerState;
}

/** A layer's stored JSON, and this player's own part of it. */
export interface LayerStore {
  table(): unknown;
  personal(): unknown;
  undo(): unknown;
  setUndo(json: string): Promise<void>;
  refused(): readonly string[];
  setRefused(ids: readonly string[]): Promise<void>;
  keptOut(): boolean;
  setKeptOut(out: boolean): Promise<void>;
}

export interface LayersDeps {
  readonly api: Pick<
    ModularAV,
    "state" | "commands" | "effects" | "contributions"
  >;
  readonly store: LayerStore;
  readonly writes: Writer;
  readonly selfIsGM: boolean;
  /** A layer newly applied here. */
  notify(layer: Layer): void;
}

export interface Layers {
  /** Runs at load and on any change: safe to repeat. */
  reconcile(): Promise<void>;
  /** "Not for me": this layer, for this player. */
  refuse(id: string): Promise<void>;
  accept(id: string): Promise<void>;
  keptOut(): boolean;
  /** "Keep the GM out of my voice". */
  setKeptOut(out: boolean): Promise<void>;
  /** Each layer offered to this client, and how it went. */
  states(): readonly LayerStatus[];
  /** What layers hold now, with the values to give back; null for nothing. */
  held(): Snapshot | null;
  /** For a preset: keeps what is held for later, and gives the rest. */
  takeHeld(snapshot: Snapshot): Promise<Snapshot>;
  /** For a preset's comparison: `snapshot` without what is held. */
  free(snapshot: Snapshot): Snapshot;
  /** For saving a preset: the channel as it is under the layers. */
  underneath(snapshot: Snapshot): Snapshot;
  /** Something a GM sees changed, that this client's channel doesn't show. */
  changed(): void;
  subscribe(listener: () => void): () => void;
}

export function createLayers(deps: LayersDeps): Layers {
  const { api, store, writes } = deps;
  let partly = false;
  let listeners: readonly (() => void)[] = [];

  const notifyChange = (): void => {
    for (const listener of listeners) listener();
  };

  /** Table first: a personal layer overrides it. */
  const offered = (): readonly Layer[] => {
    const table = parseLayer(store.table());
    const personal = parseLayer(store.personal());
    return [
      ...(table && (table.includeGMs || !deps.selfIsGM) ? [table] : []),
      ...(personal ? [personal] : []),
    ];
  };

  const accepted = (): readonly Layer[] =>
    store.keptOut()
      ? []
      : offered().filter((layer) => !store.refused().includes(layer.id));

  const record = (): UndoRecord | null => parseUndo(store.undo());

  const save = async (ids: readonly string[], values: Snapshot) => {
    await store.setUndo(JSON.stringify({ ids, values }));
  };

  const apply = async (snapshot: Snapshot): Promise<void> => {
    const plan = planSnapshot(
      snapshot,
      api.effects.list(),
      api.state.get().local,
      api.contributions.list(),
    );
    await runPlan(api.commands, plan);
    partly = plan.missing.length + plan.unsupported.length > 0;
  };

  const reconcileNow = async (): Promise<void> => {
    const layers = accepted();
    const before = record();
    const step = reconcileStep(
      mergeLayers(layers),
      before?.values ?? null,
      captureSnapshot(
        api.effects.list(),
        api.state.get().local,
        api.contributions.list(),
      ),
    );
    if (!step) {
      notifyChange();
      return;
    }
    const ids = layers.map((layer) => layer.id);
    try {
      // Still under the old ids: a failure below tells the player later.
      await save(before?.ids ?? [], step.keep);
      await apply(step.target);
      if (step.undo) await save(ids, step.undo);
      else await store.setUndo("");
      for (const layer of layers)
        if (!before?.ids.includes(layer.id)) deps.notify(layer);
    } finally {
      notifyChange();
    }
  };

  const reconcile = (): Promise<void> => writes.run("reconcile", reconcileNow);

  const stateOf = (layer: Layer): LayerState => {
    if (store.keptOut()) return "kept-out";
    if (store.refused().includes(layer.id)) return "refused";
    return partly ? "partly" : "applied";
  };

  return {
    reconcile,
    async refuse(id) {
      const known = offered().map((layer) => layer.id);
      await store.setRefused(
        [...store.refused(), id].filter((r) => known.includes(r)),
      );
      await reconcile();
      notifyChange();
    },
    async accept(id) {
      await store.setRefused(store.refused().filter((r) => r !== id));
      await reconcile();
      notifyChange();
    },
    keptOut: () => store.keptOut(),
    async setKeptOut(out) {
      await store.setKeptOut(out);
      await reconcile();
      notifyChange();
    },
    states: () =>
      offered().map((layer) => ({
        id: layer.id,
        label: layer.label,
        state: stateOf(layer),
      })),
    held: () => record()?.values ?? null,
    async takeHeld(snapshot) {
      const known = record();
      if (!known) return snapshot;
      const { free, undo } = splitHeld(snapshot, known.values);
      await save(known.ids, undo);
      return free;
    },
    free(snapshot) {
      const known = record();
      return known ? splitHeld(snapshot, known.values).free : snapshot;
    },
    underneath(snapshot) {
      const known = record();
      return known ? underneath(snapshot, known.values) : snapshot;
    },
    changed: notifyChange,
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
  };
}
