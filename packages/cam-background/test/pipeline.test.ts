import { describe, expect, it, vi } from "vitest";
import type { Compositor } from "../src/pipeline/compositor.ts";
import type { MaskSmoother } from "../src/pipeline/mask-smoother.ts";
import {
  type FrameLike,
  type Mode,
  type PipelineDeps,
  startPipeline,
} from "../src/pipeline/pipeline.ts";
import type { Segmenter } from "../src/pipeline/segmenter.ts";

interface Frame extends FrameLike {
  readonly closed: boolean;
}

const frame = (timestamp: number, width = 640, height = 480): Frame => {
  let closed = false;
  return {
    displayWidth: width,
    displayHeight: height,
    timestamp,
    get closed() {
      return closed;
    },
    close() {
      closed = true;
    },
  };
};

/** A camera whose frames the test pushes. */
function camera(): {
  readonly stream: ReadableStream<Frame>;
  push(f: Frame): void;
  end(): void;
} {
  let controller!: ReadableStreamDefaultController<Frame>;
  const stream = new ReadableStream<Frame>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    push: (f) => {
      controller.enqueue(f);
    },
    end: () => {
      controller.close();
    },
  };
}

function sink(): {
  readonly stream: WritableStream<Frame>;
  readonly sent: Frame[];
} {
  const sent: Frame[] = [];
  return {
    stream: new WritableStream<Frame>({
      write(f) {
        sent.push(f);
      },
    }),
    sent,
  };
}

function fakeSegmenter(
  invert = false,
): Segmenter & { readonly calls: number; readonly closed: boolean } {
  let calls = 0;
  let closed = false;
  return {
    invert,
    segment(_frame, use) {
      calls += 1;
      use({}, 256, 256);
    },
    close: () => {
      closed = true;
    },
    get calls() {
      return calls;
    },
    get closed() {
      return closed;
    },
  };
}

function fakeSmoother(): MaskSmoother & {
  readonly inverts: boolean[];
  readonly resets: number;
} {
  let texture: WebGLTexture | null = null;
  let resets = 0;
  const inverts: boolean[] = [];
  return {
    update(_mask, _size, _now, invert) {
      inverts.push(invert);
      texture = { mask: true };
      return texture;
    },
    get texture() {
      return texture;
    },
    reset: () => {
      resets += 1;
    },
    dispose: vi.fn(),
    inverts,
    get resets() {
      return resets;
    },
  };
}

function fakeCompositor(): Compositor & {
  readonly draws: unknown[];
  readonly images: unknown[];
} {
  const draws: unknown[] = [];
  const images: unknown[] = [];
  let hasImage = false;
  return {
    uploadFrame: vi.fn(),
    setImage(image) {
      images.push(image);
      hasImage = image !== null;
    },
    get hasImage() {
      return hasImage;
    },
    draw(background) {
      draws.push(background);
    },
    dispose: vi.fn(),
    draws,
    images,
  };
}

interface Rig {
  readonly cam: ReturnType<typeof camera>;
  readonly out: ReturnType<typeof sink>;
  readonly segmenter: ReturnType<typeof fakeSegmenter>;
  readonly compositor: ReturnType<typeof fakeCompositor>;
  readonly smoother: ReturnType<typeof fakeSmoother>;
  readonly canvas: { width: number; height: number };
  readonly errors: unknown[];
  readonly firsts: number;
  clock: number;
  pipeline: ReturnType<typeof startPipeline<Frame, string>>;
}

function rig(
  mode: Mode = "blur",
  options: {
    image?: string | null;
    scale?: PipelineDeps<Frame, string>["scaleImage"];
  } = {},
): Rig {
  const cam = camera();
  const out = sink();
  const segmenter = fakeSegmenter();
  const compositor = fakeCompositor();
  const smoother = fakeSmoother();
  const canvas = { width: 300, height: 150 };
  const errors: unknown[] = [];
  let firsts = 0;
  const state = {
    cam,
    out,
    segmenter,
    compositor,
    smoother,
    canvas,
    errors,
    clock: 0,
    get firsts() {
      return firsts;
    },
  } as Rig;
  state.pipeline = startPipeline<Frame, string>(
    {
      canvas,
      compositor,
      smoother,
      now: () => state.clock,
      capture: (timestamp) => frame(timestamp),
      scaleImage:
        options.scale ??
        ((image, crop, w, h) =>
          Promise.resolve(
            `${image}@${String(crop.width)}:${String(w)}x${String(h)}` as unknown as TexImageSource,
          )),
      imageSize: () => ({ width: 1920, height: 1080 }),
      onFirstFrame: () => {
        firsts += 1;
      },
      onError: (e) => errors.push(e),
    },
    {
      mode,
      strength: 0.5,
      image: options.image === undefined ? null : options.image,
      segmenter,
      input: cam.stream,
      output: out.stream,
    },
  );
  return state;
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("the background pipeline", () => {
  it("sends each frame drawn with a mask, and closes the camera's frames", async () => {
    // Arrange
    const r = rig();
    const input = frame(1000);

    // Act
    r.cam.push(input);
    await settle();

    // Assert
    expect(r.out.sent.map((f) => f.timestamp)).toEqual([1000]);
    expect(input.closed).toBe(true);
    expect(r.out.sent[0]?.closed).toBe(true);
    expect(r.compositor.draws).toEqual([{ mode: "blur", radius: 8 }]);
    expect(r.firsts).toBe(1);
    expect(r.canvas).toEqual({ width: 640, height: 480 });
  });

  it("segments at most 15 times a second, reusing the last mask between", async () => {
    const r = rig();

    for (let i = 0; i < 6; i += 1) {
      r.clock = i * 34;
      r.cam.push(frame(i));
      await settle();
    }

    expect(r.out.sent).toHaveLength(6);
    expect(r.segmenter.calls).toBe(3);
    expect(r.pipeline.stats()).toMatchObject({ frames: 6, segmentations: 3 });
  });

  it("segments less often when frames that segment are slow to send", async () => {
    // Arrange: sending takes 150 ms (a GPU finishing the segmentation late).
    const r = rig();
    const cam = camera();
    const slow = new WritableStream<Frame>({
      write(f) {
        r.clock += 150;
        r.out.sent.push(f);
      },
    });
    r.pipeline = startPipeline<Frame, string>(
      {
        canvas: r.canvas,
        compositor: r.compositor,
        smoother: r.smoother,
        now: () => r.clock,
        capture: (timestamp) => frame(timestamp),
        scaleImage: () => Promise.reject(new Error("no image")),
        imageSize: () => ({ width: 1, height: 1 }),
        onFirstFrame: () => undefined,
        onError: (e) => r.errors.push(e),
      },
      {
        mode: "blur",
        strength: 0.5,
        image: null,
        segmenter: r.segmenter,
        input: cam.stream,
        output: slow,
      },
    );

    // Act: frames every 34 ms of camera time, on top of the slow sends.
    for (let i = 0; i < 6; i += 1) {
      cam.push(frame(i));
      await settle();
      r.clock += 34;
    }

    // Assert: the first took 150 ms, so the next waited 67 + 150 ms.
    expect(r.out.sent).toHaveLength(6);
    expect(r.segmenter.calls).toBe(3);
  });

  it("follows strength changes from the next frame", async () => {
    const r = rig();
    r.cam.push(frame(1));
    await settle();

    r.pipeline.setStrength(1);
    r.cam.push(frame(2));
    await settle();

    expect(r.compositor.draws.at(-1)).toEqual({ mode: "blur", radius: 14 });
  });

  it("sends nothing while replacing without an image: never the raw background", async () => {
    const r = rig("replace");

    r.cam.push(frame(1));
    await settle();

    expect(r.out.sent).toEqual([]);
    expect(r.pipeline.stats().dropped).toBe(1);
    expect(r.firsts).toBe(0);
  });

  it("scales the image to the frame once, then replaces with it", async () => {
    const r = rig("replace", { image: "tavern" });

    r.cam.push(frame(1));
    await settle();
    r.cam.push(frame(2));
    r.cam.push(frame(3));
    await settle();

    expect(r.compositor.images).toEqual(["tavern@1440:640x480"]);
    expect(r.out.sent.map((f) => f.timestamp)).toEqual([2, 3]);
  });

  it("keeps the old image until a new one is scaled", async () => {
    let release: (v: TexImageSource) => void = () => undefined;
    const scale = vi.fn((image: string) =>
      image === "tavern"
        ? Promise.resolve("old" as unknown as TexImageSource)
        : new Promise<TexImageSource>((resolve) => {
            release = resolve;
          }),
    );
    const r = rig("replace", { image: "tavern", scale });
    r.cam.push(frame(1));
    await settle();

    r.pipeline.setImage("forest");
    r.cam.push(frame(2));
    await settle();
    // The first frame waited for the image; the second has the old one.
    expect(r.out.sent.map((f) => f.timestamp)).toEqual([2]);
    release("new" as unknown as TexImageSource);
    await settle();

    expect(r.compositor.images).toEqual(["old", "new"]);
  });

  it("reads a new camera after a restart, and waits while there is none", async () => {
    const r = rig();
    r.cam.push(frame(1));
    r.cam.end();
    await settle();

    const next = camera();
    r.pipeline.setInput(next.stream);
    next.push(frame(2));
    await settle();

    expect(r.out.sent.map((f) => f.timestamp)).toEqual([1, 2]);
    expect(r.errors).toEqual([]);
  });

  it("swaps the segmenter for another quality and forgets the old masks", async () => {
    const r = rig();
    r.cam.push(frame(1));
    await settle();

    const high = fakeSegmenter(true);
    r.pipeline.setSegmenter(high);
    r.clock = 1000;
    r.cam.push(frame(2));
    await settle();

    expect(r.segmenter.closed).toBe(true);
    expect(r.smoother.resets).toBe(1);
    expect(r.smoother.inverts).toEqual([false, true]);
  });

  it("reports a failure once and sends nothing after it", async () => {
    const r = rig();
    r.compositor.draw = () => {
      throw new Error("context lost");
    };

    r.cam.push(frame(1));
    await settle();
    r.cam.push(frame(2));
    await settle();

    expect(r.errors).toHaveLength(1);
    expect(r.out.sent).toEqual([]);
  });

  it("lets go of the camera when stopped", async () => {
    const r = rig();
    r.cam.push(frame(1));
    await settle();

    await r.pipeline.stop();

    expect(r.out.sent).toHaveLength(1);
    // The camera's stream was cancelled.
    expect(() => {
      r.cam.push(frame(2));
    }).toThrow();
  });
});
