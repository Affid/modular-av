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

/**
 * What a preview holds, released in reverse when it stops: when asked, when
 * its element leaves (watched from the start, so a removal while the
 * device is still opening counts), or when its effect fails. Anything
 * acquired after that is released at once.
 */
function hold(env: PreviewsDeps["env"], element: Element) {
  let releases: readonly (() => void)[] = [];
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const release of [...releases].reverse()) release();
    releases = [];
  };
  releases = [env.watchRemoval(element, stop)];
  return {
    stop,
    stopped: (): boolean => stopped,
    own(release: () => void): void {
      if (stopped) release();
      else releases = [...releases, release];
    },
  };
}

function cameraPreview(deps: PreviewsDeps): Previews["camera"] {
  const { env } = deps;
  return async (element, options) => {
    const definition = options.effect
      ? videoEffect(deps.effects, options.effect)
      : null;
    const held = hold(env, element);
    try {
      const { raw } = await captureDevice(env, "video", options.device);
      held.own(() => {
        raw.stop();
      });
      const aborted = new AbortController();
      held.own(() => {
        aborted.abort();
      });
      const started = definition
        ? await startEffect(definition, raw, aborted.signal, (error) => {
            // Fail closed, as the call does: nothing shows without it.
            held.stop();
            options.onFailed?.(error);
          })
        : null;
      if (started)
        held.own(() => {
          started.effect.dispose();
        });
      if (held.stopped()) return { stop: held.stop };
      env.showVideo(element, env.createStream([started?.shown ?? raw]));
      held.own(() => {
        env.showVideo(element, null);
      });
    } catch (error: unknown) {
      held.stop();
      throw error;
    }
    return { stop: held.stop };
  };
}

function microphonePreview(deps: PreviewsDeps): Previews["microphone"] {
  const { env } = deps;
  return async (element, options) => {
    if (typeof options.listener !== "function")
      throw new TypeError("A microphone preview needs a listener function");
    const held = hold(env, element);
    try {
      const { raw } = await captureDevice(env, "audio", options.device);
      held.own(() => {
        raw.stop();
      });
      const level = await env.createLevelMeter(raw);
      held.own(() => {
        level.dispose();
      });
      if (held.stopped()) return { stop: held.stop };
      held.own(
        env.every(element, METER_INTERVAL_MS, () => {
          try {
            options.listener(level.read());
          } catch {
            // A listener that throws would throw on every tick: stop.
            held.stop();
          }
        }),
      );
    } catch (error: unknown) {
      held.stop();
      throw error;
    }
    return { stop: held.stop };
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
