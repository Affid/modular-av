import type { AudioEffect, AudioEffectContext } from "@modular-av/api";
import type { ModelId, ModelSpec } from "./models.ts";

type AssetUrl = (path: string) => string;

/** A model's worklet node; `destroy()` frees its WASM memory. */
export type ModelNode = AudioWorkletNode & { destroy(): void };

/** The parts of @sapphi-red/web-noise-suppressor used; a fake in tests. */
export interface ModelLibrary {
  loadWasm(spec: ModelSpec, url: AssetUrl): Promise<ArrayBuffer>;
  createNode(
    spec: ModelSpec,
    context: AudioContext,
    wasm: ArrayBuffer,
  ): ModelNode;
}

export interface ModelRuntime {
  start(
    spec: ModelSpec,
    context: AudioEffectContext,
    url: AssetUrl,
  ): Promise<AudioEffect>;
}

/** The node stopped processing: its worklet threw. */
export class ProcessorError extends Error {
  override readonly name = "ProcessorError";
}

/** Loaded into each context before a model: it says when a model runs. */
export const READY_WORKLET = "worklets/ready.js";
export const READY_MESSAGE = "modular-av-mic-denoise:ready";
/** Compiling a model takes well under a second; a slow machine gets more. */
export const READY_TIMEOUT_MS = 10_000;

/** One cached promise per key, forgotten if it fails so a later try can work. */
function cached<K, V>(
  cache: {
    get(key: K): Promise<V> | undefined;
    set(key: K, value: Promise<V>): unknown;
    delete(key: K): unknown;
  },
  key: K,
  load: () => Promise<V>,
): Promise<V> {
  const known = cache.get(key);
  if (known) return known;
  const loading = load();
  cache.set(key, loading);
  loading.catch(() => cache.delete(key));
  return loading;
}

/**
 * Resolves once the node's model runs: until then the worklet sends
 * silence, so the core must not switch over to it yet.
 */
function whenReady(node: ModelNode, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (error?: unknown): void => {
      clearTimeout(timer);
      node.port.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", onAbort);
      if (error === undefined) resolve();
      else
        reject(
          error instanceof Error
            ? error
            : new DOMException("The noise model was turned off", "AbortError"),
        );
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.data === READY_MESSAGE) done();
    };
    const onAbort = (): void => {
      done(signal.reason);
    };
    const timer = setTimeout(() => {
      done(new DOMException("The noise model didn't start", "TimeoutError"));
    }, READY_TIMEOUT_MS);
    node.port.addEventListener("message", onMessage);
    node.port.start();
    signal.addEventListener("abort", onAbort);
  });
}

function toEffect(
  node: ModelNode,
  spec: ModelSpec,
  fail: (error: unknown) => void,
): AudioEffect {
  // The core's microphone chain is mono.
  node.channelCount = 1;
  node.channelCountMode = "explicit";
  node.onprocessorerror = () => {
    node.onprocessorerror = null;
    fail(new ProcessorError(`The ${spec.id} worklet stopped`));
  };
  return {
    input: node,
    output: node,
    dispose() {
      node.onprocessorerror = null;
      node.disconnect();
      node.destroy();
    },
  };
}

export function createRuntime(library: ModelLibrary): ModelRuntime {
  const wasm = new Map<ModelId, Promise<ArrayBuffer>>();
  const worklets = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

  /** The announcing worklet first: it must wrap the model's processor. */
  const workletsOf = async (
    context: AudioContext,
    spec: ModelSpec,
    url: AssetUrl,
  ): Promise<void> => {
    const loaded = worklets.get(context) ?? new Map<string, Promise<void>>();
    worklets.set(context, loaded);
    const load = (path: string): Promise<void> =>
      cached(loaded, path, () => context.audioWorklet.addModule(url(path)));
    await load(READY_WORKLET);
    await load(spec.worklet);
  };

  return {
    async start(spec, { audioContext, signal, fail }, url) {
      const [binary] = await Promise.all([
        cached(wasm, spec.id, () => library.loadWasm(spec, url)),
        workletsOf(audioContext, spec, url),
      ]);
      signal.throwIfAborted();
      const effect = toEffect(
        library.createNode(spec, audioContext, binary),
        spec,
        fail,
      );
      try {
        await whenReady(effect.input as ModelNode, signal);
      } catch (error: unknown) {
        effect.dispose();
        throw error;
      }
      return effect;
    },
  };
}
