import type { AudioEffectContext } from "@modular-av/api";
import { vi } from "vitest";
import { MODELS, type ModelSpec } from "../src/models.ts";
import { type ModelLibrary, READY_MESSAGE } from "../src/runtime.ts";

export const spec = (id: string): ModelSpec => {
  const found = MODELS.find((m) => m.id === id);
  if (!found) throw new Error(`no model ${id}`);
  return found;
};

export const url = (path: string): string =>
  `/modules/modular-av-mic-denoise/${path}`;

export interface FakeNode {
  channelCount: number;
  channelCountMode: string;
  onprocessorerror: (() => void) | null;
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly port: MessagePort;
  /** Plays the worklet saying its model runs. */
  readonly ready: () => void;
}

type Listener = (event: MessageEvent) => void;

function fakePort(): {
  port: MessagePort;
  post: (data: unknown) => void;
} {
  let listeners: readonly Listener[] = [];
  const port = {
    addEventListener: (_type: string, listener: Listener) => {
      listeners = [...listeners, listener];
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners = listeners.filter((l) => l !== listener);
    },
    start: () => undefined,
  } as unknown as MessagePort;
  const post = (data: unknown): void => {
    for (const listener of listeners) listener({ data } as MessageEvent);
  };
  return { port, post };
}

export interface FakeLibraryOptions {
  /** The first downloads fail. */
  readonly wasmFails?: number;
  /** False: the worklet never says its model runs, until a test does. */
  readonly ready?: boolean;
}

export function fakeLibrary(options: FakeLibraryOptions = {}) {
  let failures = options.wasmFails ?? 0;
  const nodes: FakeNode[] = [];
  const loadWasm = vi.fn(
    (model: ModelSpec, assetUrl: (p: string) => string) => {
      if (failures > 0) {
        failures -= 1;
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve(
        new TextEncoder().encode(assetUrl(model.wasm)).buffer,
      );
    },
  );
  const library: ModelLibrary = {
    loadWasm,
    createNode: () => {
      const { port, post } = fakePort();
      const node: FakeNode = {
        channelCount: 2,
        channelCountMode: "max",
        onprocessorerror: null,
        disconnect: vi.fn(),
        destroy: vi.fn(),
        port,
        ready: () => {
          post(READY_MESSAGE);
        },
      };
      nodes.push(node);
      if (options.ready ?? true) queueMicrotask(node.ready);
      return node as unknown as AudioWorkletNode & { destroy(): void };
    },
  };
  return { library, nodes, loadWasm };
}

export function fakeContext(options: { addModuleFails?: boolean } = {}) {
  const addModule = vi.fn((_url: string) =>
    options.addModuleFails
      ? Promise.reject(new DOMException("404", "AbortError"))
      : Promise.resolve(),
  );
  const audioContext = {
    audioWorklet: { addModule },
  } as unknown as AudioContext;
  const controller = new AbortController();
  const fail = vi.fn();
  const context: AudioEffectContext = {
    audioContext,
    signal: controller.signal,
    fail,
  };
  return { context, controller, addModule, fail };
}

export const ticks = async (count = 10): Promise<void> => {
  for (let i = 0; i < count; i += 1) await Promise.resolve();
};
