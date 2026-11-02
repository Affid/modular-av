import type { EffectDefinition } from "@modular-av/api";
import { parseSnapshot, type Snapshot } from "../model/snapshot.ts";
import { type Layer, layerFromSnapshot, parseLayer } from "./layer.ts";

/** "table" for everyone, or a user's id. */
export type LayerTarget = string;

export const TABLE = "table";

/** Only GMs write these; Foundry's permissions stop anyone else. */
export interface GmLayerStore {
  table(): unknown;
  setTable(json: string): Promise<void>;
  personal(user: string): unknown;
  /** Null ends it. */
  setPersonal(user: string, json: string | null): Promise<void>;
}

export interface GmLayersDeps {
  readonly store: GmLayerStore;
  definitions(): readonly EffectDefinition[];
  newId(): string;
}

export interface LayerOptions {
  readonly target: LayerTarget;
  readonly includeGMs: boolean;
}

export interface GivenLayer extends Snapshot {
  readonly label: string;
  readonly includeGMs?: boolean;
}

export interface GmLayers {
  applyPreset(
    preset: Snapshot & { readonly name: string },
    options: LayerOptions,
  ): Promise<void>;
  /** For a macro: a layer written by hand, checked like any other. */
  set(target: LayerTarget, layer: GivenLayer): Promise<void>;
  end(target: LayerTarget): Promise<void>;
  tableLayer(): Layer | null;
  personalLayer(user: string): Layer | null;
}

/** The table layer is replaced whole: a world setting would lose a merge. */
export function createGmLayers(deps: GmLayersDeps): GmLayers {
  const { store } = deps;

  const write = async (target: LayerTarget, layer: Layer): Promise<void> => {
    const json = JSON.stringify(layer);
    if (!parseLayer(json)) throw new Error("That isn't a layer");
    if (target === TABLE) await store.setTable(json);
    else await store.setPersonal(target, json);
  };

  return {
    applyPreset: (preset, { target, includeGMs }) =>
      write(
        target,
        layerFromSnapshot(preset, deps.definitions(), {
          id: deps.newId(),
          label: preset.name,
          includeGMs,
        }),
      ),
    async set(target, layer) {
      const snapshot = parseSnapshot(layer);
      if (!snapshot) throw new Error("That isn't a layer");
      await write(target, {
        ...snapshot,
        id: deps.newId(),
        label: layer.label,
        includeGMs: layer.includeGMs === true,
      });
    },
    async end(target) {
      if (target === TABLE) await store.setTable("");
      else await store.setPersonal(target, null);
    },
    tableLayer: () => parseLayer(store.table()),
    personalLayer: (user) => parseLayer(store.personal(user)),
  };
}
