import type { Vision } from "../pipeline/segmenter.ts";
import { errorData, type FromWorker, type ToWorker } from "../protocol.ts";
import type { Quality } from "../settings.ts";
import { createQualitySwitch, type QualitySwitch } from "./quality.ts";
import { createSegmenters, type Segmenters } from "./segmenters.ts";
import { type Session, type Start, startSession } from "./session.ts";

export { ContextLostError, WebGLUnavailableError } from "./session.ts";

/** WebGL drawn by the CPU: the high quality model runs at under 1 fps there. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render/i;

/** Whether this thread's WebGL runs in software, from a throwaway context. */
export function softwareWebGL(): boolean {
  const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(
    gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
  );
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return SOFTWARE_RENDERER.test(renderer);
}

/** The canvas's first size; MediaPipe and each frame size it as needed. */
const CANVAS = { width: 640, height: 480 } as const;

interface Running {
  readonly session: Session;
  readonly quality: QualitySwitch;
}

type Handler = (message: ToWorker) => void;

type Handlers = {
  [K in ToWorker["type"]]: (message: Extract<ToWorker, { type: K }>) => void;
};

/** What each message does: most reach the running pipeline once it runs. */
function messageHandlers(on: {
  readonly start: (message: Start) => void;
  readonly whenStarted: (apply: (current: Running) => void) => void;
  readonly stop: () => void;
  readonly post: (message: FromWorker) => void;
}): Handlers {
  const { whenStarted, post } = on;
  return {
    start: on.start,
    input: (m) => {
      whenStarted((r) => {
        r.session.pipeline.setInput(m.input);
      });
    },
    strength: (m) => {
      whenStarted((r) => {
        r.session.pipeline.setStrength(m.value);
      });
    },
    image: (m) => {
      whenStarted((r) => {
        r.session.pipeline.setImage(m.image);
      });
    },
    quality: (m) => {
      whenStarted((r) => {
        r.quality.request(m.quality);
      });
    },
    stats: (m) => {
      whenStarted((r) => {
        post({ type: "stats", id: m.id, stats: r.session.pipeline.stats() });
      });
    },
    ping: (m) => {
      post({ type: "pong", id: m.id });
    },
    stop: on.stop,
  };
}

/** Standard where WebGL runs in software (the quality setting says so). */
function usableQuality(isSoftware: () => boolean): (q: Quality) => Quality {
  let software: boolean | null = null;
  return (quality) => {
    software ??= isSoftware();
    return software ? "standard" : quality;
  };
}

/** Starts one effect's session and its quality switch; null if turned off meanwhile. */
async function startRunning(
  message: Start,
  deps: {
    readonly segmenters: Segmenters;
    readonly usable: (quality: Quality) => Quality;
    readonly isOver: () => boolean;
    readonly post: (message: FromWorker) => void;
    readonly fail: (error: unknown) => void;
  },
): Promise<Running | null> {
  const canvas = new OffscreenCanvas(CANVAS.width, CANVAS.height);
  const quality = deps.usable(message.quality);
  const segmenter = await deps.segmenters.create(
    message.files,
    message.models[quality],
    canvas,
  );
  if (deps.isOver()) {
    segmenter.close();
    return null;
  }
  const session = startSession(message, canvas, segmenter, {
    onFirstFrame: () => {
      deps.post({ type: "first-frame" });
    },
    onError: deps.fail,
  });
  return {
    session,
    quality: createQualitySwitch(session, deps.segmenters, quality, {
      usable: deps.usable,
      isOver: deps.isOver,
      onError: (error) => {
        deps.post({ type: "model-error", error: errorData(error) });
      },
    }),
  };
}

/**
 * What runs in the worker: one pipeline per effect, started by the host's
 * "start" and fed by its messages. On the page's thread too, to measure
 * the difference (see the bench).
 */
export function createRuntime(
  vision: Vision,
  post: (message: FromWorker) => void,
  isSoftware: () => boolean = softwareWebGL,
): { handle: Handler } {
  const segmenters = createSegmenters(vision, () => performance.now());
  let running: Running | null = null;
  let starting: Promise<void> = Promise.resolve();
  let stopped = false;
  const usable = usableQuality(isSoftware);
  const fail = (error: unknown): void => {
    post({ type: "error", error: errorData(error) });
  };
  const startDeps = { segmenters, usable, isOver: () => stopped, post, fail };
  const start = async (message: Start): Promise<void> => {
    running = await startRunning(message, startDeps);
  };
  /** Messages that came while it starts apply once it runs. */
  const whenStarted = (apply: (current: Running) => void): void => {
    void starting.then(() => {
      if (running && !stopped) apply(running);
    });
  };

  const stop = async (): Promise<void> => {
    stopped = true;
    await starting;
    await running?.session.dispose();
    running = null;
    post({ type: "stopped" });
  };

  const handlers = messageHandlers({
    start: (m) => {
      starting = start(m).catch(fail);
    },
    whenStarted,
    stop: () => {
      stop().catch(fail);
    },
    post,
  });

  return {
    handle(message) {
      if (stopped && message.type !== "ping") return;
      (handlers[message.type] as Handler)(message);
    },
  };
}
