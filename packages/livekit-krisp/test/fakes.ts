import type { AudioEffectContext, Observable } from "@modular-av/api";
import { vi } from "vitest";
import type { Bridge } from "../src/bridge.ts";
import type {
  KrispModule,
  KrispProcessor,
  KrispQuality,
} from "../src/krisp.ts";

export interface FakeRoom extends Observable<object | null> {
  set(room: object | null): void;
}

export function fakeRoom(initial: object | null = null): FakeRoom {
  let current = initial;
  let listeners: readonly ((room: object | null) => void)[] = [];
  return {
    get: () => current,
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    set(room) {
      current = room;
      for (const listener of listeners) listener(room);
    },
  };
}

export interface FakeKrisp {
  readonly module: KrispModule;
  readonly processors: FakeProcessor[];
  readonly qualities: KrispQuality[];
}

export interface FakeProcessor extends KrispProcessor {
  /** What `init` was given, each time. */
  readonly inits: unknown[];
  readonly published: object[];
  readonly destroyed: boolean;
  /** Plays Krisp turning itself off. */
  turnOff(): void;
}

export interface FakeKrispOptions {
  readonly supported?: boolean;
  /** The project allows Krisp: setEnabled(true) turns it on. */
  readonly allowed?: boolean | (() => boolean);
}

export function fakeKrisp(options: FakeKrispOptions = {}): FakeKrisp {
  const processors: FakeProcessor[] = [];
  const qualities: KrispQuality[] = [];
  const allowed = (): boolean => {
    const value = options.allowed ?? true;
    return typeof value === "function" ? value() : value;
  };
  const make = (): FakeProcessor => {
    let enabled = false;
    let destroyed = false;
    const published: object[] = [];
    const inits: unknown[] = [];
    const processed = new EventTarget() as MediaStreamTrack;
    const processor: FakeProcessor = {
      processedTrack: undefined,
      inits,
      published,
      get destroyed() {
        return destroyed;
      },
      init: (options) => {
        inits.push(options);
        (processor as { processedTrack?: MediaStreamTrack }).processedTrack =
          processed;
        return Promise.resolve();
      },
      onPublish: (room) => {
        published.push(room);
        return Promise.resolve();
      },
      setEnabled: (enable) => {
        enabled = enable && allowed();
        return Promise.resolve(enabled);
      },
      isEnabled: () => enabled,
      destroy: () => {
        destroyed = true;
        return Promise.resolve();
      },
      turnOff() {
        enabled = false;
        processed.dispatchEvent(new Event("disable-lk-krisp-noise-filter"));
      },
    };
    return processor;
  };
  const module: KrispModule = {
    KrispNoiseFilter: ({ quality }) => {
      qualities.push(quality);
      const processor = make();
      processors.push(processor);
      return processor;
    },
    isKrispNoiseFilterSupported: () => options.supported ?? true,
  };
  return { module, processors, qualities };
}

export interface FakeBridge extends Bridge {
  readonly attached: MediaStreamTrack[];
  readonly disposed: boolean;
}

export function fakeBridge(): FakeBridge {
  const attached: MediaStreamTrack[] = [];
  let disposed = false;
  return {
    input: { label: "input" } as unknown as AudioNode,
    output: { label: "output" } as unknown as AudioNode,
    track: { label: "bridge" } as unknown as MediaStreamTrack,
    attached,
    get disposed() {
      return disposed;
    },
    attach: (track) => {
      attached.push(track);
    },
    dispose: () => {
      disposed = true;
    },
  };
}

export function effectContext() {
  const controller = new AbortController();
  const fail = vi.fn();
  const context: AudioEffectContext = {
    audioContext: {} as AudioContext,
    signal: controller.signal,
    fail,
  };
  return { context, controller, fail };
}

export const ticks = async (count = 10): Promise<void> => {
  for (let i = 0; i < count; i += 1) await Promise.resolve();
};
