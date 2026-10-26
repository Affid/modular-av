import type { ModularAV } from "@modular-av/api";
import { createBackgroundDefinitions } from "./definition.ts";
import { type CameraBackgroundSettings, MODULE_ID } from "./settings.ts";

const reportError = (error: unknown): void => {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: Camera background | ${text}`);
};

/** Registers blur and replace; their code loads once one is turned on. */
export function registerBackground(
  api: Pick<ModularAV, "effects" | "assetUrl">,
  settings: CameraBackgroundSettings,
  route: (path: string) => string,
  onError: (error: unknown) => void = reportError,
): void {
  const definitions = createBackgroundDefinitions({
    assetUrl: (path) => api.assetUrl(MODULE_ID, path),
    route,
    settings,
    loadHost: () => import("./host.ts"),
    loadEffect: () => import("./effect.ts"),
    onError,
  });
  for (const definition of definitions) api.effects.register(definition);
}
