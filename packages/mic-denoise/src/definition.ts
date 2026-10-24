import type { AudioEffectDefinition } from "@modular-av/api";
import type { ModelSpec } from "./models.ts";
import type { ModelRuntime } from "./runtime.ts";

export interface DefinitionDeps {
  /** Resolves a path in this module's directory. */
  readonly assetUrl: (path: string) => string;
  /** The model code, a lazy chunk with the library in it. */
  readonly loadRuntime: () => Promise<ModelRuntime>;
}

/** What the browser needs: AudioWorklet (secure contexts only) and WebAssembly. */
export function canRunWorklets(scope: {
  readonly AudioWorkletNode?: unknown;
  readonly WebAssembly?: { readonly instantiate?: unknown } | undefined;
  readonly isSecureContext?: boolean | undefined;
}): boolean {
  return (
    typeof scope.AudioWorkletNode === "function" &&
    typeof scope.WebAssembly?.instantiate === "function" &&
    scope.isSecureContext !== false
  );
}

/**
 * A model as the core sees it: small, with the model code loaded only in
 * `create()`. All three replace the browser's own noise suppression.
 */
export function createModelDefinition(
  spec: ModelSpec,
  deps: DefinitionDeps,
): AudioEffectDefinition {
  return {
    id: spec.id,
    kind: "audio",
    label: spec.label,
    stage: "denoise",
    exclusiveGroup: "noise-suppression",
    cost: spec.cost,
    isSupported: () => canRunWorklets(globalThis),
    async create(context) {
      const runtime = await deps.loadRuntime();
      context.signal.throwIfAborted();
      return runtime.start(spec, context, deps.assetUrl);
    },
  };
}
