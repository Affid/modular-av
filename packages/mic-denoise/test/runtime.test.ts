import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntime, READY_TIMEOUT_MS } from "../src/runtime.ts";
import { fakeContext, fakeLibrary, spec, ticks, url } from "./fakes.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("a running model", () => {
  it("is one mono worklet node, fed the model's WASM from this module", async () => {
    const { library, nodes, loadWasm } = fakeLibrary();
    const { context, addModule } = fakeContext();

    const effect = await createRuntime(library).start(
      spec("gtcrn"),
      context,
      url,
    );

    expect(addModule.mock.calls).toEqual([
      [url("worklets/ready.js")],
      [url("models/gtcrn-worklet.js")],
    ]);
    expect(loadWasm).toHaveBeenCalledWith(spec("gtcrn"), url);
    expect(effect.input).toBe(nodes[0]);
    expect(effect.output).toBe(nodes[0]);
    expect(nodes[0]).toMatchObject({
      channelCount: 1,
      channelCountMode: "explicit",
    });
  });

  it("loads each WASM once per page and each worklet once per context", async () => {
    const { library, loadWasm } = fakeLibrary();
    const runtime = createRuntime(library);
    const first = fakeContext();

    await runtime.start(spec("rnnoise"), first.context, url);
    await runtime.start(spec("rnnoise"), first.context, url);
    const second = fakeContext();
    await runtime.start(spec("rnnoise"), second.context, url);

    expect(loadWasm).toHaveBeenCalledTimes(1);
    expect(first.addModule).toHaveBeenCalledTimes(2);
    expect(second.addModule).toHaveBeenCalledTimes(2);
  });

  it("tries the download again after it failed", async () => {
    const { library, loadWasm } = fakeLibrary({ wasmFails: 1 });
    const runtime = createRuntime(library);

    await expect(
      runtime.start(spec("speex"), fakeContext().context, url),
    ).rejects.toThrow("Failed to fetch");
    await runtime.start(spec("speex"), fakeContext().context, url);

    expect(loadWasm).toHaveBeenCalledTimes(2);
  });

  it("tries the worklets again after they failed to load", async () => {
    const runtime = createRuntime(fakeLibrary().library);
    const broken = fakeContext({ addModuleFails: true });
    await expect(
      runtime.start(spec("speex"), broken.context, url),
    ).rejects.toThrow();

    const addModule = vi.fn(() => Promise.resolve());
    (
      broken.context.audioContext as unknown as {
        audioWorklet: { addModule: typeof addModule };
      }
    ).audioWorklet.addModule = addModule;
    await runtime.start(spec("speex"), broken.context, url);

    expect(addModule).toHaveBeenCalledTimes(2);
  });

  it("starts only once its model runs: the worklet sends silence until then", async () => {
    const { library, nodes } = fakeLibrary({ ready: false });
    const { context } = fakeContext();
    let started = false;

    const starting = createRuntime(library)
      .start(spec("rnnoise"), context, url)
      .then(() => {
        started = true;
      });
    await ticks();
    const before = started;
    nodes[0]?.ready();
    await starting;

    expect(before).toBe(false);
    expect(started).toBe(true);
  });

  it("gives up on a model that never runs, and frees it", async () => {
    vi.useFakeTimers();
    const { library, nodes } = fakeLibrary({ ready: false });
    const { context } = fakeContext();

    const starting = createRuntime(library).start(spec("gtcrn"), context, url);
    const failed = expect(starting).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    await failed;

    expect(nodes[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("makes no node when turned off while it loaded", async () => {
    const { library, nodes } = fakeLibrary();
    const { context, controller } = fakeContext();

    const starting = createRuntime(library).start(
      spec("rnnoise"),
      context,
      url,
    );
    controller.abort();

    await expect(starting).rejects.toMatchObject({ name: "AbortError" });
    expect(nodes).toHaveLength(0);
  });

  it("frees a model turned off while it got ready", async () => {
    const { library, nodes } = fakeLibrary({ ready: false });
    const { context, controller } = fakeContext();

    const starting = createRuntime(library).start(spec("speex"), context, url);
    await ticks();
    controller.abort();

    await expect(starting).rejects.toMatchObject({ name: "AbortError" });
    expect(nodes[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("reports a worklet that broke, once", async () => {
    const { library, nodes } = fakeLibrary();
    const { context, fail } = fakeContext();
    await createRuntime(library).start(spec("rnnoise"), context, url);

    nodes[0]?.onprocessorerror?.();
    nodes[0]?.onprocessorerror?.();

    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail.mock.calls[0]?.[0]).toMatchObject({ name: "ProcessorError" });
  });

  it("frees the model's memory and leaves the chain when disposed", async () => {
    const { library, nodes } = fakeLibrary();
    const { context } = fakeContext();
    const effect = await createRuntime(library).start(
      spec("rnnoise"),
      context,
      url,
    );

    effect.dispose();

    expect(nodes[0]?.disconnect).toHaveBeenCalled();
    expect(nodes[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(nodes[0]?.onprocessorerror).toBeNull();
  });
});
