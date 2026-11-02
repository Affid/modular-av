import type { Presets } from "./presets.ts";

export interface MacroApi {
  readonly presets: {
    /** Their names. */
    list(): Promise<readonly string[]>;
    /** By name, whatever its case: false if there is none. */
    apply(name: string): Promise<boolean>;
    next(): Promise<unknown>;
    previous(): Promise<unknown>;
  };
}

/** `game.modules.get("modular-av-audio-mixer").api`, for a GM's macro. */
export function macroApi(
  load: () => Promise<Pick<Presets, "list" | "apply" | "step">>,
): MacroApi {
  return {
    presets: {
      list: async () => (await load()).list().map((p) => p.name),
      async apply(name) {
        const presets = await load();
        const wanted = name.trim().toLowerCase();
        const found = presets
          .list()
          .find((p) => p.name.toLowerCase() === wanted);
        if (!found) return false;
        await presets.apply(found.id);
        return true;
      },
      next: async () => (await load()).step(1),
      previous: async () => (await load()).step(-1),
    },
  };
}
