import type {
  CameraHold,
  EffectContext,
  EffectState,
  VideoEffect,
  VideoEffectDefinition,
} from "@modular-av/api";
import { createEffectRunner } from "./effect-runner.ts";
import type { MediaEnv } from "./env.ts";

/** No processed frame for this long: the camera is held until one comes. */
export const STALL_MS = 1_000;

export interface CameraDeps {
  readonly env: Pick<MediaEnv, "canWatchFrames" | "watchFrames">;
  /** The output or an effect's state changed. */
  readonly onChange: () => void;
  readonly onReplaced: (ids: readonly string[]) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * The camera's processing, failing closed: while a video effect is wanted,
 * only its processed frames go out, and only once the watchdog saw them
 * flow. Starting, stalled, failed or unsupported, the camera is held; raw
 * video is never sent instead. A running effect outlives camera restarts.
 */
export interface Camera {
  /** The raw device track, or null; calls apply in order. */
  setInput(track: MediaStreamTrack | null): Promise<void>;
  /** The track to send, null while there is none or it is held. */
  readonly output: MediaStreamTrack | null;
  readonly hold: CameraHold | null;
  setEffects(
    definitions: readonly VideoEffectDefinition[],
    wanted: ReadonlySet<string>,
  ): void;
  effectStatus(id: string): EffectState;
  dispose(): void;
}

interface Running {
  readonly effect: VideoEffect;
  readonly output: MediaStreamTrack;
  readonly fail: (error: unknown) => void;
  dispose(): void;
}

interface Watchdog {
  watch(track: MediaStreamTrack | null): void;
  /** Frames flowed since the last `watch` or `restart`. */
  readonly flowing: boolean;
  readonly stalled: boolean;
  /** The input changed: wait for a frame again. */
  restart(): void;
  stop(): void;
}

function createWatchdog(env: CameraDeps["env"], changed: () => void): Watchdog {
  let seen = false;
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unwatch = (): void => undefined;

  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      changed();
    }, STALL_MS);
  };
  const onFrame = (): void => {
    const news = !seen || stalled;
    seen = true;
    stalled = false;
    arm();
    if (news) changed();
  };
  const stop = (): void => {
    unwatch();
    unwatch = () => undefined;
    clearTimeout(timer);
    seen = false;
    stalled = false;
  };

  return {
    watch(track) {
      stop();
      if (!track) return;
      unwatch = env.watchFrames(track, onFrame);
      arm();
    },
    get flowing() {
      return seen;
    },
    get stalled() {
      return stalled;
    },
    restart() {
      seen = false;
      stalled = false;
      arm();
    },
    stop,
  };
}

export function createCamera(deps: CameraDeps): Camera {
  let input: MediaStreamTrack | null = null;
  let definitions: readonly VideoEffectDefinition[] = [];
  let wanted: ReadonlySet<string> = new Set();
  let running: Running | null = null;
  let queue: Promise<void> = Promise.resolve();
  const changed = (): void => {
    deps.onChange();
  };
  const watchdog = createWatchdog(deps.env, changed);
  /** Without frame watching there is no fail-closed camera: unsupported. */
  const watchable = new WeakMap<VideoEffectDefinition, VideoEffectDefinition>();
  const guarded = (d: VideoEffectDefinition): VideoEffectDefinition => {
    const known = watchable.get(d);
    if (known) return known;
    const wrapped: VideoEffectDefinition = {
      ...d,
      isSupported: () => deps.env.canWatchFrames() && d.isSupported(),
      create: (context) => d.create(context),
    };
    watchable.set(d, wrapped);
    return wrapped;
  };

  const start = async (
    definition: VideoEffectDefinition,
    context: EffectContext,
  ): Promise<Running> => {
    const effect = await definition.create(context);
    try {
      const first = input;
      if (!first)
        throw new DOMException("The camera is off", "InvalidStateError");
      const output = await effect.start(first);
      // The device changed while it started.
      if (input && input !== first) await effect.replaceInput(input);
      return {
        effect,
        output,
        fail: context.fail,
        dispose: () => {
          effect.dispose();
        },
      };
    } catch (error: unknown) {
      effect.dispose();
      throw error;
    }
  };

  const runner = createEffectRunner<VideoEffectDefinition, Running>({
    // One video effect at a time.
    group: () => "video",
    start,
    onRunning(list) {
      const next = list[0]?.instance ?? null;
      if (next === running) return;
      running = next;
      watchdog.watch(next?.output ?? null);
      changed();
    },
    onStatus: changed,
    onReplaced: deps.onReplaced,
    onError: deps.onError,
  });

  /**
   * Without a camera, nothing starts (a start under way is aborted, to start
   * again with the camera); what runs stays, keeping its state.
   */
  const applyEffects = (): void => {
    const all = definitions.map(guarded);
    const isRunning = (d: VideoEffectDefinition): boolean =>
      runner.status(d.id).status === "running";
    runner.update(input ? all : all.filter(isRunning), wanted);
  };

  const wantsEffect = (): boolean => definitions.some((d) => wanted.has(d.id));

  const switchInput = async (track: MediaStreamTrack | null): Promise<void> => {
    input = track;
    const current = running;
    if (current && track) {
      watchdog.restart();
      changed();
      try {
        await current.effect.replaceInput(track);
      } catch (error: unknown) {
        current.fail(error);
      }
    }
    applyEffects();
    changed();
  };

  return {
    setInput(track) {
      const run = queue.then(() => switchInput(track));
      queue = run.catch(() => undefined);
      return run;
    },
    get output() {
      if (!input) return null;
      if (!wantsEffect()) return input;
      if (running && watchdog.flowing && !watchdog.stalled)
        return running.output;
      return null;
    },
    get hold() {
      if (!input || !wantsEffect()) return null;
      if (running) {
        if (watchdog.stalled) return "effect-stalled";
        return watchdog.flowing ? null : "effect-starting";
      }
      const statuses = definitions
        .filter((d) => wanted.has(d.id))
        .map((d) => runner.status(d.id).status);
      if (statuses.includes("starting")) return "effect-starting";
      if (statuses.some((s) => s === "failed" || s === "unsupported"))
        return "effect-failed";
      return "effect-starting";
    },
    setEffects(nextDefinitions, nextWanted) {
      definitions = nextDefinitions;
      wanted = nextWanted;
      applyEffects();
      changed();
    },
    effectStatus: (id) => runner.status(id),
    dispose() {
      runner.dispose();
      watchdog.stop();
      running = null;
      input = null;
    },
  };
}
