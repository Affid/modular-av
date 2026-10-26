import { afterEach, describe, expect, it, vi } from "vitest";
import type { Segmenter, Vision } from "../src/pipeline/segmenter.ts";
import type { FromWorker } from "../src/protocol.ts";
import { createQualitySwitch } from "../src/worker/quality.ts";
import { createRuntime } from "../src/worker/runtime.ts";
import { createSegmenters } from "../src/worker/segmenters.ts";
import type { Session } from "../src/worker/session.ts";

/** A TensorFlow Lite file, as far as the check goes. */
const MODEL = new Uint8Array([0, 0, 0, 0, 84, 70, 76, 51]);

function fakeSegmenter(name: string): Segmenter & { closed: boolean } {
  const s = {
    name,
    closed: false,
    invert: false,
    segment: () => undefined,
    close() {
      s.closed = true;
    },
  };
  return s;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("quality swaps", () => {
  function setup(create: (url: string) => Promise<Segmenter>) {
    const installed: string[] = [];
    const errors: unknown[] = [];
    let over = false;
    const session = {
      files: { loader: "/l.js", wasm: "/w.wasm" },
      models: { standard: "standard", high: "high" },
      canvas: {} as OffscreenCanvas,
      pipeline: {
        setSegmenter: (s: Segmenter & { name?: string }) => {
          installed.push(s.name ?? "?");
        },
      },
    } as unknown as Session;
    const sw = createQualitySwitch(
      session,
      { create: (_files, url) => create(url) },
      "standard",
      {
        usable: (q) => q,
        isOver: () => over,
        onError: (e) => errors.push(e),
      },
    );
    return {
      sw,
      installed,
      errors,
      end: () => {
        over = true;
      },
    };
  }

  it("lets the latest asked for win, skipping those asked for meanwhile", async () => {
    // Arrange: each segmenter starts when released.
    const pending: (() => void)[] = [];
    const made: (Segmenter & { closed: boolean })[] = [];
    const { sw, installed } = setup(
      (url) =>
        new Promise((resolve) => {
          pending.push(() => {
            const s = fakeSegmenter(url);
            made.push(s);
            resolve(s);
          });
        }),
    );

    // Act: high, standard, high in quick succession.
    sw.request("high");
    sw.request("standard");
    sw.request("high");
    pending.shift()?.();
    await flush();
    pending.shift()?.();
    await flush();

    // Assert: the first (high) was overtaken, the last (high) runs.
    expect(made[0]?.closed).toBe(true);
    expect(installed).toEqual(["high"]);
  });

  it("does nothing for the quality already running", async () => {
    const create = vi.fn(() => Promise.resolve(fakeSegmenter("x")));
    const { sw } = setup(create);

    sw.request("standard");
    await flush();

    expect(create).not.toHaveBeenCalled();
  });

  it("reports one that can't start and keeps the old", async () => {
    const { sw, installed, errors } = setup(() =>
      Promise.reject(new Error("404")),
    );

    sw.request("high");
    await flush();

    expect(installed).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("closes one that started after the effect was turned off", async () => {
    let release: () => void = () => undefined;
    const made = fakeSegmenter("high");
    const { sw, installed, end } = setup(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(made);
          };
        }),
    );

    sw.request("high");
    end();
    release();
    await flush();

    expect(installed).toEqual([]);
    expect(made.closed).toBe(true);
  });
});

describe("segmenters", () => {
  const files = { loader: "/l.js", wasm: "/w.wasm" };
  const canvas = {} as OffscreenCanvas;

  it("download each model once", async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response(MODEL)));
    vi.stubGlobal("fetch", fetcher);
    const vision: Vision = {
      ImageSegmenter: {
        createFromOptions: () =>
          Promise.resolve({
            getLabels: () => ["person"],
            close: vi.fn(),
          } as never),
      },
    };
    const segmenters = createSegmenters(vision, () => 0);

    await segmenters.create(files, "/m.tflite", canvas);
    await segmenters.create(files, "/m.tflite", canvas);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fail one that doesn't start in time, and close it if it starts later", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(MODEL)));
    let finish: () => void = () => undefined;
    const close = vi.fn();
    const vision: Vision = {
      ImageSegmenter: {
        createFromOptions: () =>
          new Promise((resolve) => {
            finish = () => {
              resolve({ getLabels: () => ["person"], close } as never);
            };
          }),
      },
    };
    const creating = createSegmenters(vision, () => 0, 1000).create(
      files,
      "/m.tflite",
      canvas,
    );
    const failed = expect(creating).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    finish();
    await vi.advanceTimersByTimeAsync(0);

    expect(close).toHaveBeenCalled();
  });
});

describe("the worker's runtime", () => {
  it("answers pings, even after it stopped", () => {
    const posted: FromWorker[] = [];
    const runtime = createRuntime(
      {} as Vision,
      (m) => posted.push(m),
      () => false,
    );

    runtime.handle({ type: "stop" });
    runtime.handle({ type: "ping", id: 7 });

    expect(posted).toContainEqual({ type: "pong", id: 7 });
  });

  it("reports a start without WebGL, and lets the segmenter go", async () => {
    // Arrange: a canvas with no WebGL2, a segmenter that starts.
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return null;
        }
      },
    );
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(MODEL)));
    const close = vi.fn();
    const vision: Vision = {
      ImageSegmenter: {
        createFromOptions: () =>
          Promise.resolve({ getLabels: () => ["person"], close } as never),
      },
    };
    const posted: FromWorker[] = [];
    const runtime = createRuntime(
      vision,
      (m) => posted.push(m),
      () => false,
    );

    // Act
    runtime.handle({
      type: "start",
      files: { loader: "/l.js", wasm: "/w.wasm" },
      models: { standard: "/s.tflite", high: "/h.tflite" },
      quality: "high",
      mode: "blur",
      strength: 0.5,
      image: null,
      input: new ReadableStream(),
      output: new WritableStream(),
    });
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Assert
    expect(posted).toContainEqual({
      type: "error",
      error: {
        name: "WebGLUnavailableError",
        message: "WebGL2 is unavailable",
      },
    });
    expect(close).toHaveBeenCalled();
  });
});
