import type { EffectContext, VideoEffectDefinition } from "@modular-av/api";
import type * as EffectModule from "./effect.ts";
import type * as HostModule from "./host.ts";
import type { Mode } from "./pipeline/pipeline.ts";
import { type CameraBackgroundSettings, MODULE_ID } from "./settings.ts";

export { FILES } from "./files.ts";

export interface DefinitionDeps {
  /** Resolves a path in this module's directory. */
  readonly assetUrl: (path: string) => string;
  /** Foundry's route for a path on its server. */
  readonly route: (path: string) => string;
  readonly settings: CameraBackgroundSettings;
  /** The page's side of the effect, lazy chunks. */
  readonly loadHost: () => Promise<HostApi>;
  readonly loadEffect: () => Promise<
    Pick<typeof EffectModule, "startBackground">
  >;
  /** Something went wrong that the effect survives (an image that didn't load). */
  readonly onError: (error: unknown) => void;
  readonly canRun?: () => boolean;
}

export type HostApi = Pick<
  typeof HostModule,
  "createHost" | "workerPort" | "decodeImage"
>;

type Scope = Readonly<Record<string, unknown>>;

const NEEDED = [
  "Worker",
  "OffscreenCanvas",
  "VideoFrame",
  "MediaStreamTrackProcessor",
  "MediaStreamTrackGenerator",
  "createImageBitmap",
] as const;

/** WebGL2 on an OffscreenCanvas, asked once: it makes a context. */
let webgl2: boolean | null = null;
function hasWebGL2(): boolean {
  if (webgl2 === null) {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webgl2 = gl !== null;
  }
  return webgl2;
}

/**
 * A worker, OffscreenCanvas with WebGL2 and Chromium's insertable streams
 * (the core also needs MediaStreamTrackProcessor for its frame watchdog).
 */
export function canRunBackground(
  scope: Scope = globalThis,
  canDraw: () => boolean = hasWebGL2,
): boolean {
  return NEEDED.every((name) => typeof scope[name] === "function") && canDraw();
}

function definition(mode: Mode, deps: DefinitionDeps): VideoEffectDefinition {
  return {
    id: `background-${mode}`,
    kind: "video",
    label: `${MODULE_ID}.effects.${mode}`,
    exclusiveGroup: "camera-background",
    // Measured with a GPU (handoff §15): a few ms of GPU per frame and
    // none of the page's main thread; without a GPU, about 12 fps.
    cost: "medium",
    isSupported: deps.canRun ?? (() => canRunBackground()),
    async create(context: EffectContext) {
      context.signal.throwIfAborted();
      const [{ startBackground }, host] = await Promise.all([
        deps.loadEffect(),
        deps.loadHost(),
      ]);
      context.signal.throwIfAborted();
      return startBackground(mode, { ...deps, host }, context);
    },
  };
}

/** Blur and replace: one choice, since one video effect runs at a time. */
export function createBackgroundDefinitions(
  deps: DefinitionDeps,
): readonly VideoEffectDefinition[] {
  return [definition("blur", deps), definition("replace", deps)];
}
