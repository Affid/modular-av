import type { EffectContext, VideoEffect } from "@modular-av/api";
import type { DefinitionDeps, HostApi } from "./definition.ts";
import { FILES } from "./files.ts";
import { ImageLoadError } from "./errors.ts";
import type { BackgroundEffect, Insertable } from "./host.ts";
import type { Mode } from "./pipeline/pipeline.ts";
import { imageUrl, type Quality } from "./settings.ts";

/** Chromium's insertable streams (isSupported checked they exist). */
const streams = (): {
  readonly MediaStreamTrackProcessor: Insertable["Processor"];
  readonly MediaStreamTrackGenerator: Insertable["Generator"];
} => globalThis as unknown as ReturnType<typeof streams>;

interface Applied {
  strength: number;
  quality: Quality;
  image: string;
}

/** Applies each setting to the running effect when it differs from what runs. */
function applier(
  host: BackgroundEffect,
  mode: Mode,
  deps: DefinitionDeps,
  applied: Applied,
) {
  const { settings } = deps;
  const strength = (value: number): void => {
    if (value === applied.strength) return;
    applied.strength = value;
    host.setStrength(value);
  };
  const quality = (value: Quality): void => {
    if (value === applied.quality) return;
    applied.quality = value;
    host.setQuality(value);
  };
  const image = (path: string): void => {
    if (mode !== "replace" || path === applied.image) return;
    applied.image = path;
    const url = imageUrl(path, deps.route);
    if (!url) {
      deps.onError(new ImageLoadError(`Not an image address: ${path}`));
      return;
    }
    // The old image stays if the new one can't load.
    host.setImage(url).catch(deps.onError);
  };
  /** What changed while it started, then every change. */
  return (): readonly (() => void)[] => {
    strength(settings.strength.get());
    quality(settings.quality.get());
    image(settings.image.get());
    return [
      settings.strength.subscribe(strength),
      settings.quality.subscribe(quality),
      settings.image.subscribe(image),
    ];
  };
}

/** The running effect, kept in step with the player's settings. */
function followSettings(
  host: BackgroundEffect,
  mode: Mode,
  deps: DefinitionDeps,
  applied: Applied,
): VideoEffect {
  const follow = applier(host, mode, deps, applied);
  let off: readonly (() => void)[] = [];
  return {
    async start(input) {
      const output = await host.start(input);
      off = follow();
      return output;
    },
    replaceInput: (input) => host.replaceInput(input),
    dispose() {
      for (const unsubscribe of off) unsubscribe();
      off = [];
      host.dispose();
    },
  };
}

/**
 * Starts a background effect on the page: the host with this module's
 * files and the player's settings, kept in step with them while it runs.
 */
export function startBackground(
  mode: Mode,
  deps: DefinitionDeps & { readonly host: HostApi },
  context: EffectContext,
): VideoEffect {
  const url = deps.assetUrl;
  const { host } = deps;
  const applied: Applied = {
    strength: deps.settings.strength.get(),
    quality: deps.settings.quality.get(),
    image: deps.settings.image.get(),
  };
  const path = applied.image;
  const image = mode === "replace" ? imageUrl(path, deps.route) : null;
  if (mode === "replace" && !image)
    throw new ImageLoadError(`Not an image address: ${path}`);
  const effect = host.createHost({
    connect: () => host.workerPort(url(FILES.worker)),
    insertable: {
      Processor: streams().MediaStreamTrackProcessor,
      Generator: streams().MediaStreamTrackGenerator,
    },
    files: { loader: url(FILES.loader), wasm: url(FILES.wasm) },
    models: { standard: url(FILES.standard), high: url(FILES.high) },
    quality: applied.quality,
    mode,
    strength: applied.strength,
    image,
    loadImage: host.decodeImage,
    context,
    onError: deps.onError,
  });
  return followSettings(effect, mode, deps, applied);
}
