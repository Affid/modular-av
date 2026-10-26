import type { EffectContext } from "@modular-av/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHost,
  DEAD_AFTER_MS,
  type HostOptions,
  PING_EVERY_MS,
} from "../src/host.ts";
import type { FromWorker, Port, ToWorker } from "../src/protocol.ts";

interface FakePort extends Port {
  readonly sent: ToWorker[];
  readonly transfers: Transferable[][];
  terminated: boolean;
  reply(message: FromWorker): void;
  crash(error: Error): void;
}

function fakePort(): FakePort {
  const listeners: ((m: FromWorker) => void)[] = [];
  const crashes: ((e: Error) => void)[] = [];
  const port: FakePort = {
    sent: [],
    transfers: [],
    terminated: false,
    post(message, transfer = []) {
      port.sent.push(message);
      port.transfers.push(transfer);
    },
    onMessage: (l) => listeners.push(l),
    onCrash: (l) => crashes.push(l),
    terminate() {
      port.terminated = true;
    },
    reply: (m) => {
      for (const l of [...listeners]) l(m);
    },
    crash: (e) => {
      for (const l of crashes) l(e);
    },
  };
  return port;
}

class FakeProcessor {
  readonly readable = new ReadableStream<VideoFrame>();
  readonly init: { track: MediaStreamTrack };
  constructor(init: { track: MediaStreamTrack }) {
    this.init = init;
  }
}

class FakeGenerator {
  readonly writable = new WritableStream<VideoFrame>();
  stopped = false;
  readonly id = "generated";
  readonly init: { kind: "video" };
  constructor(init: { kind: "video" }) {
    this.init = init;
  }
  stop(): void {
    this.stopped = true;
  }
}

function setup(overrides: Partial<HostOptions> = {}) {
  const port = fakePort();
  const failures: unknown[] = [];
  const controller = new AbortController();
  const context: EffectContext = {
    signal: controller.signal,
    fail: (e) => failures.push(e),
  };
  const host = createHost({
    connect: () => port,
    insertable: {
      Processor: FakeProcessor,
      Generator:
        FakeGenerator as unknown as HostOptions["insertable"]["Generator"],
    },
    files: { loader: "/l.js", wasm: "/w.wasm" },
    models: { standard: "/s.tflite", high: "/h.tflite" },
    quality: "standard",
    mode: "blur",
    strength: 0.5,
    image: null,
    loadImage: () => Promise.reject(new Error("no images")),
    context,
    ...overrides,
  });
  return { host, port, failures, controller };
}

const camera = { id: "camera" } as MediaStreamTrack;

/** Lets the host's awaits run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the effect on the page", () => {
  it("hands the camera's frames to the worker and runs once a frame is out", async () => {
    // Arrange
    const { host, port } = setup();

    // Act
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    const output = await started;

    // Assert
    expect(output.id).toBe("generated");
    expect(port.sent[0]).toMatchObject({
      type: "start",
      mode: "blur",
      quality: "standard",
      strength: 0.5,
      models: { standard: "/s.tflite", high: "/h.tflite" },
    });
    // The streams are transferred, not copied.
    expect(port.transfers[0]).toHaveLength(2);
  });

  it("fails to start when the worker reports an error, and lets it go", async () => {
    const { host, port } = setup();

    const started = host.start(camera);
    await flush();
    port.reply({
      type: "error",
      error: { name: "ModelFileError", message: "404" },
    });

    await expect(started).rejects.toMatchObject({ name: "ModelFileError" });
    expect(port.sent.at(-1)).toEqual({ type: "stop" });
    port.reply({ type: "stopped" });
    expect(port.terminated).toBe(true);
  });

  it("fails to start when nothing comes out in time", async () => {
    const { host } = setup({ startTimeoutMs: 1000 });

    const started = host.start(camera);
    const failed = expect(started).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(1000);

    await failed;
  });

  it("stops starting when turned off", async () => {
    const { host, controller } = setup();

    const started = host.start(camera);
    await flush();
    controller.abort();

    await expect(started).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports a worker that fails or crashes after it started", async () => {
    const { host, port, failures } = setup();
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    await started;

    port.reply({
      type: "error",
      error: { name: "ContextLostError", message: "lost" },
    });
    port.crash(new Error("crashed"));

    expect(failures.map((e) => (e as Error).name)).toEqual([
      "ContextLostError",
      "Error",
    ]);
  });

  it("reports a worker that stops answering, as one that died quietly", async () => {
    // Arrange
    const { host, port, failures } = setup();
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    await started;

    // Act: it answers the first ping, then nothing.
    await vi.advanceTimersByTimeAsync(PING_EVERY_MS);
    const ping = port.sent.at(-1);
    if (ping?.type !== "ping") throw new Error("no ping");
    port.reply({ type: "pong", id: ping.id });
    await vi.advanceTimersByTimeAsync(DEAD_AFTER_MS - 1);
    expect(failures).toEqual([]);
    await vi.advanceTimersByTimeAsync(PING_EVERY_MS + 1);

    // Assert
    expect(failures.map((e) => (e as Error).name)).toEqual(["WorkerError"]);
  });

  it("passes setting changes and camera restarts on to the worker", async () => {
    const { host, port } = setup();
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    await started;

    host.setStrength(0.9);
    host.setQuality("high");
    await host.replaceInput({ id: "camera 2" } as MediaStreamTrack);

    expect(port.sent.slice(1).map((m) => m.type)).toEqual([
      "strength",
      "quality",
      "input",
    ]);
  });

  it("stops the worker and its output when disposed, ending it if it hangs", async () => {
    const { host, port } = setup();
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    const output = (await started) as unknown as FakeGenerator;

    host.dispose();
    await vi.advanceTimersByTimeAsync(5000);

    expect(port.sent.at(-1)).toEqual({ type: "stop" });
    expect(output.stopped).toBe(true);
    expect(port.terminated).toBe(true);
  });

  it("applies image changes in the order asked, dropping one decoded late", async () => {
    // Arrange: A decodes after B.
    const decoded: Record<string, () => void> = {};
    const closed: string[] = [];
    const bitmap = (name: string): ImageBitmap =>
      ({ name, close: () => closed.push(name) }) as unknown as ImageBitmap;
    const { host, port } = setup({
      loadImage: (url) =>
        new Promise((resolve) => {
          decoded[url] = () => {
            resolve(bitmap(url));
          };
        }),
    });
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    await started;

    // Act
    const a = host.setImage("A");
    const b = host.setImage("B");
    decoded.B?.();
    await b;
    decoded.A?.();
    await a;

    // Assert
    const images = port.sent.filter((m) => m.type === "image");
    expect(
      images.map((m) => (m.image as unknown as { name: string }).name),
    ).toEqual(["B"]);
    expect(closed).toEqual(["A"]);
  });

  it("reports another quality that couldn't start, and goes on", async () => {
    const errors: unknown[] = [];
    const { host, port, failures } = setup({ onError: (e) => errors.push(e) });
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    await started;

    port.reply({
      type: "model-error",
      error: { name: "ModelFileError", message: "404" },
    });

    expect((errors[0] as Error).name).toBe("ModelFileError");
    expect(failures).toEqual([]);
  });

  it("settles stats asked for once disposed", async () => {
    const { host, port } = setup();
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    await started;

    const pending = host.stats();
    host.dispose();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(host.stats()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps a worker that answers each ping, however late the pings come", async () => {
    const { host, port, failures } = setup();
    const started = host.start(camera);
    await flush();
    port.reply({ type: "first-frame" });
    await started;

    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(PING_EVERY_MS);
      const ping = port.sent.at(-1);
      if (ping?.type === "ping") port.reply({ type: "pong", id: ping.id });
    }

    expect(failures).toEqual([]);
  });
});
