import type { ModularAV } from "@modular-av/api";
import { createModelDefinition } from "./definition.ts";
import { MODELS, MODULE_ID } from "./models.ts";
import type { ModelRuntime } from "./runtime.ts";

const loadRuntime = (): Promise<ModelRuntime> =>
  import("./library.ts").then((m) => m.runtime);

/** Registers every model; their code loads once one is turned on. */
export function registerModels(
  api: Pick<ModularAV, "effects" | "assetUrl">,
  load: () => Promise<ModelRuntime> = loadRuntime,
): void {
  const assetUrl = (path: string): string => api.assetUrl(MODULE_ID, path);
  for (const model of MODELS)
    api.effects.register(
      createModelDefinition(model, { assetUrl, loadRuntime: load }),
    );
}
