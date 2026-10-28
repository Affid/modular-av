import type { ModularAV } from "@modular-av/api";
import { backgroundContributions } from "./controls.ts";
import { createBackgroundDefinitions } from "./definition.ts";
import type { FoundryUi } from "./picker.ts";
import { type CameraBackgroundSettings, MODULE_ID } from "./settings.ts";

const reportError = (error: unknown): void => {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  // eslint-disable-next-line no-console -- the console is Foundry's log
  console.error(`Modular A/V: Camera background | ${text}`);
};

export interface RegisterDeps {
  readonly settings: CameraBackgroundSettings;
  /** Foundry's route for a path on its server. */
  readonly route: (path: string) => string;
  /** Foundry's file browser and dialogs, for "Choose an image…". */
  readonly ui: () => FoundryUi;
  readonly onError?: (error: unknown) => void;
}

/**
 * Registers blur and replace and their controls; their code (and the
 * image picker's) loads once used.
 */
export function registerBackground(
  api: Pick<
    ModularAV,
    "effects" | "contributions" | "assetUrl" | "state" | "commands"
  >,
  deps: RegisterDeps,
): void {
  const definitions = createBackgroundDefinitions({
    assetUrl: (path) => api.assetUrl(MODULE_ID, path),
    route: deps.route,
    settings: deps.settings,
    loadHost: () => import("./host.ts"),
    loadEffect: () => import("./effect.ts"),
    onError: deps.onError ?? reportError,
  });
  for (const definition of definitions) api.effects.register(definition);
  const contributions = backgroundContributions({
    settings: deps.settings,
    route: deps.route,
    pickImage: async (current) => {
      const { pickImage } = await import("./picker.ts");
      return pickImage(current, deps.ui());
    },
  });
  for (const contribution of contributions)
    api.contributions.register(contribution);
}
