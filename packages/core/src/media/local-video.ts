import type {
  CameraHold,
  EffectState,
  VideoEffectDefinition,
} from "@modular-av/api";
import type { Camera, createCamera } from "./camera.ts";
import type { MediaEnv } from "./env.ts";

export interface LocalVideoDeps {
  readonly env: Pick<MediaEnv, "canWatchFrames" | "watchFrames">;
  readonly onChange: () => void;
  readonly onReplaced: (ids: readonly string[]) => void;
  readonly onError: (error: unknown) => void;
  /** Loads the camera chain's code; tests make it fail. */
  readonly loadCamera?: () => Promise<{
    readonly createCamera: typeof createCamera;
  }>;
}

/**
 * The local camera: the raw device until a video effect is first wanted,
 * then the camera chain (loaded then, outside the entry chunk). While it
 * loads, the camera is held: fail closed.
 */
export interface LocalVideo {
  /** The raw device track, or null; calls apply in order. */
  setInput(track: MediaStreamTrack | null): Promise<void>;
  readonly output: MediaStreamTrack | null;
  readonly hold: CameraHold | null;
  /** The hide: applied to whatever is sent; the raw device feeds effects. */
  setEnabled(enabled: boolean): void;
  setEffects(
    definitions: readonly VideoEffectDefinition[],
    wanted: ReadonlySet<string>,
  ): void;
  effectStatus(id: string): EffectState | null;
  dispose(): void;
}

export function createLocalVideo(deps: LocalVideoDeps): LocalVideo {
  let raw: MediaStreamTrack | null = null;
  let camera: Camera | null = null;
  let loading: Promise<Camera | null> | null = null;
  let definitions: readonly VideoEffectDefinition[] = [];
  let wanted: ReadonlySet<string> = new Set();
  let enabled = false;
  /** The camera chain couldn't load: held as failed until it loads. */
  let loadFailed = false;
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;

  const wantsEffect = (): boolean => definitions.some((d) => wanted.has(d.id));

  const output = (): MediaStreamTrack | null => {
    if (!raw) return null;
    if (camera) return camera.output;
    return wantsEffect() ? null : raw;
  };

  /** Fail closed: whatever is about to be sent starts with the hide. */
  const applyEnabled = (): void => {
    const sent = output();
    if (raw) raw.enabled = sent === raw ? enabled : true;
    if (sent && sent !== raw) sent.enabled = enabled;
  };

  const changed = (): void => {
    applyEnabled();
    deps.onChange();
  };

  const load = async (): Promise<Camera> => {
    const { createCamera } = await (deps.loadCamera?.() ??
      import("./camera.ts"));
    const created = createCamera({
      env: deps.env,
      onChange: changed,
      onReplaced: deps.onReplaced,
      onError: deps.onError,
    });
    if (disposed) {
      created.dispose();
      return created;
    }
    // Before feeding it, so no device change can miss it.
    camera = created;
    created.setEffects(definitions, wanted);
    await created.setInput(raw);
    loadFailed = false;
    changed();
    return created;
  };

  return {
    setInput(track) {
      const run = queue.then(async () => {
        raw = track;
        if (camera) await camera.setInput(track);
        changed();
      });
      queue = run.catch(() => undefined);
      return run;
    },
    get output() {
      return output();
    },
    get hold() {
      if (!raw) return null;
      if (camera) return camera.hold;
      if (!wantsEffect()) return null;
      return loadFailed ? "effect-failed" : "effect-starting";
    },
    setEnabled(next) {
      enabled = next;
      applyEnabled();
    },
    setEffects(nextDefinitions, nextWanted) {
      definitions = nextDefinitions;
      wanted = nextWanted;
      if (camera) camera.setEffects(definitions, wanted);
      else if (wantsEffect())
        loading ??= load().catch((error: unknown) => {
          // Tried again with the next change of effects.
          loading = null;
          camera = null;
          loadFailed = true;
          deps.onError(error);
          changed();
          return null;
        });
      changed();
    },
    effectStatus: (id) => camera?.effectStatus(id) ?? null,
    dispose() {
      disposed = true;
      camera?.dispose();
      raw = null;
    },
  };
}
