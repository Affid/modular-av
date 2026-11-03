import type { GivenLayer, GmLayers } from "../layers/gm-layers.ts";
import type { Presets } from "./presets.ts";

export interface MacroLayerOptions {
  /** A user's id; everyone if not given. */
  readonly user?: string;
  readonly includeGMs?: boolean;
}

export interface MacroApi {
  readonly presets: {
    /** Their names. */
    list(): Promise<readonly string[]>;
    /** By name, whatever its case: false if there is none. */
    apply(name: string): Promise<boolean>;
    next(): Promise<unknown>;
    previous(): Promise<unknown>;
  };
  /** A GM's. Each rejects on a player's client. */
  readonly layers: {
    /** Lays a saved preset over the table or a user: false if there is none. */
    apply(preset: string, options?: MacroLayerOptions): Promise<boolean>;
    /** Lays a layer written by hand, such as `{ label, effects }`. */
    set(layer: GivenLayer, options?: MacroLayerOptions): Promise<void>;
    end(options?: MacroLayerOptions): Promise<void>;
  };
}

export interface MacroDeps {
  readonly presets: Pick<Presets, "list" | "apply" | "step">;
  readonly gmLayers: Pick<GmLayers, "applyPreset" | "set" | "end"> | null;
}

const findByName = (presets: MacroDeps["presets"], name: string) => {
  const wanted = name.trim().toLowerCase();
  return presets.list().find((p) => p.name.toLowerCase() === wanted);
};

const TABLE_TARGET = "table";

/** `game.modules.get("modular-av-audio-mixer").api`, for a GM's macro. */
export function macroApi(load: () => Promise<MacroDeps>): MacroApi {
  const presets = async () => (await load()).presets;
  const gmLayers = async () => {
    const { gmLayers: layers } = await load();
    if (!layers) throw new Error("Only a GM can set a layer");
    return layers;
  };
  return {
    presets: {
      list: async () => (await presets()).list().map((p) => p.name),
      async apply(name) {
        const all = await presets();
        const found = findByName(all, name);
        if (!found) return false;
        await all.apply(found.id);
        return true;
      },
      next: async () => (await presets()).step(1),
      previous: async () => (await presets()).step(-1),
    },
    layers: {
      async apply(name, options = {}) {
        const found = findByName(await presets(), name);
        if (!found) return false;
        await (
          await gmLayers()
        ).applyPreset(found, {
          target: options.user ?? TABLE_TARGET,
          includeGMs: options.includeGMs === true,
        });
        return true;
      },
      set: async (layer, options = {}) =>
        (await gmLayers()).set(options.user ?? TABLE_TARGET, {
          ...layer,
          includeGMs: options.includeGMs === true || layer.includeGMs === true,
        }),
      end: async (options = {}) =>
        (await gmLayers()).end(options.user ?? TABLE_TARGET),
    },
  };
}
