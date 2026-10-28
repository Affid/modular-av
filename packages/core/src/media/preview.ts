import type {
  EffectDefinition,
  Previews,
  Registry,
  VideoEffect,
  VideoEffectDefinition,
} from "@modular-av/api";
import { AVCommandError } from "../errors.ts";
import { captureDevice } from "./device-capture.ts";
import type { MediaEnv } from "./env.ts";
import { METER_INTERVAL_MS } from "./meters.ts";

export interface PreviewsDeps {
  readonly env: Pick<
    MediaEnv,
    | "captureAudio"
    | "captureVideo"
    | "createStream"
    | "showVideo"
    | "watchRemoval"
    | "createLevelMeter"
    | "every"
  >;
  readonly effects: Pick<Registry<EffectDefinition>, "get">;
}

/** The video effect a preview runs, checked before the camera is opened. */
function videoEffect(
  effects: PreviewsDeps["effects"],
  id: string,
): VideoEffectDefinition {
  const definition = effects.get(id);
  if (definition?.kind !== "video")
    throw new AVCommandError("unknown-effect", `No video effect "${id}"`, {
      effect: id,
    });
  if (!definition.isSupported())
    throw new AVCommandError(
      "unsupported",
      `"${id}" can't run in this browser`,
      { effect: id },
    );
  return definition;
}

/** Runs the effect on the camera; disposed if it can't start. */
async function startEffect(
  definition: VideoEffectDefinition,
  raw: MediaStreamTrack,
  signal: AbortSignal,
  fail: (error: unknown) => void,
): Promise<{ readonly effect: VideoEffect; readonly shown: MediaStreamTrack }> {
  const effect = await definition.create({ signal, fail });
  try {
    return { effect, shown: await effect.start(raw) };
  } catch (error: unknown) {
    effect.dispose();
    throw error;
  }
}

function cameraPreview(deps: PreviewsDeps): Previews["camera"] {
  const { env } = deps;
  return async (element, options) => {
    const definition = options.effect
      ? videoEffect(deps.effects, options.effect)
      : null;
    const { raw } = await captureDevice(env, "video", options.device);
    const aborted = new AbortController();
    let effect: VideoEffect | null = null;
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      aborted.abort();
      unwatch();
      effect?.dispose();
      env.showVideo(element, null);
      raw.stop();
    };
    let unwatch = (): void => undefined;
    try {
      const started = definition
        ? await startEffect(definition, raw, aborted.signal, (error) => {
            // Fail closed, as the call does: nothing shows without it.
            stop();
            options.onFailed?.(error);
          })
        : null;
      effect = started?.effect ?? null;
      env.showVideo(element, env.createStream([started?.shown ?? raw]));
      unwatch = env.watchRemoval(element, stop);
    } catch (error: unknown) {
      stop();
      throw error;
    }
    return { stop };
  };
}

function microphonePreview(deps: PreviewsDeps): Previews["microphone"] {
  const { env } = deps;
  return async (element, options) => {
    const { raw } = await captureDevice(env, "audio", options.device);
    const level = await env.createLevelMeter(raw).catch((error: unknown) => {
      raw.stop();
      throw error;
    });
    const stopTimer = env.every(element, METER_INTERVAL_MS, () => {
      options.listener(level.read());
    });
    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
      stopped = true;
      stopTimer();
      unwatch();
      level.dispose();
      raw.stop();
    };
    const unwatch = env.watchRemoval(element, stop);
    return { stop };
  };
}

/**
 * Cameras and microphones shown to the player alone, outside the call:
 * their own captures, never published, released when stopped.
 */
export function createPreviews(deps: PreviewsDeps): Previews {
  return Object.freeze({
    camera: cameraPreview(deps),
    microphone: microphonePreview(deps),
  });
}
