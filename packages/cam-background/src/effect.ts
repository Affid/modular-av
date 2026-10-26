import type { EffectContext, VideoEffect } from "@modular-av/api";
import type { DefinitionDeps, HostApi } from "./definition.ts";
import { FILES } from "./files.ts";
import { ImageLoadError } from "./errors.ts";
import type { BackgroundEffect, Insertable } from "./host.ts";
import type { Mode } from "./pipeline/pipeline.ts";
import { imageUrl } from "./settings.ts";

/** Chromium's insertable streams (isSupported checked they exist). */
const streams = (): {
  readonly MediaStreamTrackProcessor: Insertable["Processor"];
  readonly MediaStreamTrackGenerator: Insertable["Generator"];
} => globalThis as unknown as ReturnType<typeof streams>;

/** The running effect, kept in step with the player's settings. */
function followSettings(
  host: BackgroundEffect,
  mode: Mode,
  deps: DefinitionDeps,
): VideoEffect {
  const { settings } = deps;
  let off: readonly (() => void)[] = [];
  return {
    async start(input) {
      const output = await host.start(input);
      off = [
        settings.strength.subscribe((value) => {
          host.setStrength(value);
        }),
        settings.quality.subscribe((value) => {
          host.setQuality(value);
        }),
        ...(mode === "replace"
          ? [
              settings.image.subscribe((path) => {
                const url = imageUrl(path, deps.route);
                if (!url) {
                  deps.onError(
                    new ImageLoadError(`Not an image address: ${path}`),
                  );
                  return;
                }
                // The old image stays if the new one can't load.
                host.setImage(url).catch(deps.onError);
              }),
            ]
          : []),
      ];
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
  const path = deps.settings.image.get();
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
    quality: deps.settings.quality.get(),
    mode,
    strength: deps.settings.strength.get(),
    image,
    loadImage: host.decodeImage,
    context,
  });
  return followSettings(effect, mode, deps);
}
