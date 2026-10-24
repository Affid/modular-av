import type { EffectContext, EffectState } from "@modular-av/api";
import { errorName } from "../errors.ts";

/** What the runner needs of an effect definition. */
export interface RunnableDefinition {
  readonly id: string;
  readonly exclusiveGroup?: string;
  isSupported(): boolean;
}

export interface Started<T> {
  readonly id: string;
  readonly instance: T;
}

export interface EffectRunnerDeps<D extends RunnableDefinition, T> {
  /** One running effect per group; null for none. */
  group(definition: D): string | null;
  /** Creates the effect and starts it; resolves once it runs. */
  start(definition: D, context: EffectContext): Promise<T>;
  /**
   * The running effects changed, in definition order. Called before the
   * effects that left are disposed, so the chain switches over first.
   */
  onRunning(running: readonly Started<T>[]): void;
  onStatus(): void;
  /** Effects stopped because another of their group now runs. */
  onReplaced(ids: readonly string[]): void;
  onError(error: unknown): void;
}

export interface EffectRunner<D extends RunnableDefinition> {
  /** The effects that may run now, and the ones the player wants on. */
  update(definitions: readonly D[], wanted: ReadonlySet<string>): void;
  status(id: string): EffectState;
  /** Takes out a running (or starting) effect, as its own `fail` would. */
  fail(id: string, error: unknown): void;
  dispose(): void;
}

type Slot<T> =
  | {
      readonly kind: "starting";
      readonly token: object;
      readonly controller: AbortController;
    }
  | { readonly kind: "running"; readonly token: object; readonly instance: T }
  | { readonly kind: "failed"; readonly error: string };

const STATE_OFF: EffectState = { status: "off", error: null };

/**
 * Runs the effects the player wants, one per exclusive group. A new effect
 * replaces the old one of its group only once it runs (never stop, then
 * start); if it fails, the old one stays. A failed effect is retried only
 * after it was turned off and on again.
 */
export function createEffectRunner<
  D extends RunnableDefinition,
  T extends { dispose(): void },
>(deps: EffectRunnerDeps<D, T>): EffectRunner<D> {
  let definitions: readonly D[] = [];
  let wanted: ReadonlySet<string> = new Set();
  let slots = new Map<string, Slot<T>>();
  /** Replaced by another of their group: not restarted while still wanted. */
  let replaced: ReadonlySet<string> = new Set();
  let disposed = false;
  const supported = new WeakMap<D, boolean>();

  const isSupported = (definition: D): boolean => {
    const known = supported.get(definition);
    if (known !== undefined) return known;
    let result: boolean;
    try {
      result = definition.isSupported();
    } catch {
      result = false;
    }
    supported.set(definition, result);
    return result;
  };

  const setSlots = (next: Map<string, Slot<T>>): void => {
    slots = next;
  };
  const without = (ids: readonly string[]): Map<string, Slot<T>> =>
    new Map([...slots].filter(([id]) => !ids.includes(id)));

  const handOver = (): void => {
    const running = definitions.flatMap((d) => {
      const slot = slots.get(d.id);
      return slot?.kind === "running"
        ? [{ id: d.id, instance: slot.instance }]
        : [];
    });
    deps.onRunning(running);
  };

  const disposeAll = (instances: readonly T[]): void => {
    for (const instance of instances) {
      try {
        instance.dispose();
      } catch (error: unknown) {
        deps.onError(error);
      }
    }
  };

  const groupOf = (id: string): string | null => {
    const definition = definitions.find((d) => d.id === id);
    return definition ? deps.group(definition) : null;
  };

  const isCurrent = (id: string, token: object): boolean =>
    !disposed &&
    slots.get(id) !== undefined &&
    tokenOf(slots.get(id)) === token;

  const fail = (id: string, token: object, error: unknown): void => {
    if (!isCurrent(id, token)) return;
    const slot = slots.get(id);
    setSlots(
      new Map(slots).set(id, { kind: "failed", error: errorName(error) }),
    );
    deps.onError(error);
    if (slot?.kind === "starting") slot.controller.abort();
    if (slot?.kind === "running") {
      handOver();
      disposeAll([slot.instance]);
    }
    deps.onStatus();
  };

  const run = (id: string, token: object, instance: T): void => {
    if (!isCurrent(id, token)) {
      disposeAll([instance]);
      return;
    }
    const group = groupOf(id);
    const others = [...slots].flatMap(([other, slot]) =>
      other !== id && slot.kind === "running" && group !== null
        ? groupOf(other) === group
          ? [{ id: other, instance: slot.instance }]
          : []
        : [],
    );
    setSlots(
      without(others.map((o) => o.id)).set(id, {
        kind: "running",
        token,
        instance,
      }),
    );
    replaced = new Set([...replaced, ...others.map((o) => o.id)]);
    handOver();
    disposeAll(others.map((o) => o.instance));
    if (others.length > 0) deps.onReplaced(others.map((o) => o.id));
    deps.onStatus();
  };

  const start = (definition: D): void => {
    const token = {};
    const controller = new AbortController();
    setSlots(
      new Map(slots).set(definition.id, {
        kind: "starting",
        token,
        controller,
      }),
    );
    const context: EffectContext = {
      signal: controller.signal,
      fail: (error) => {
        fail(definition.id, token, error);
      },
    };
    let starting: Promise<T>;
    try {
      starting = deps.start(definition, context);
    } catch (error: unknown) {
      starting = Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    starting.then(
      (instance) => {
        try {
          run(definition.id, token, instance);
        } catch (error: unknown) {
          // E.g. its nodes belong to another context: take it out.
          fail(definition.id, token, error);
        }
      },
      (error: unknown) => {
        fail(definition.id, token, error);
      },
    );
  };

  const keeps = (id: string): boolean => {
    const definition = definitions.find((d) => d.id === id);
    return (
      definition !== undefined && wanted.has(id) && isSupported(definition)
    );
  };

  const stopUnwanted = (): void => {
    const leaving = [...slots].filter(([id]) => !keeps(id));
    if (leaving.length === 0) return;
    setSlots(without(leaving.map(([id]) => id)));
    for (const [, slot] of leaving)
      if (slot.kind === "starting") slot.controller.abort();
    const instances = leaving.flatMap(([, slot]) =>
      slot.kind === "running" ? [slot.instance] : [],
    );
    if (instances.length === 0) return;
    handOver();
    disposeAll(instances);
  };

  return {
    update(nextDefinitions, nextWanted) {
      if (disposed) return;
      definitions = nextDefinitions;
      wanted = nextWanted;
      replaced = new Set([...replaced].filter((id) => wanted.has(id)));
      stopUnwanted();
      for (const definition of definitions)
        if (
          keeps(definition.id) &&
          !slots.has(definition.id) &&
          !replaced.has(definition.id)
        )
          start(definition);
      deps.onStatus();
    },
    status(id) {
      const definition = definitions.find((d) => d.id === id);
      if (definition && !isSupported(definition))
        return { status: "unsupported", error: null };
      const slot = slots.get(id);
      if (!slot) return STATE_OFF;
      if (slot.kind === "failed")
        return { status: "failed", error: slot.error };
      return { status: slot.kind, error: null };
    },
    fail(id, error) {
      const token = tokenOf(slots.get(id));
      if (token) fail(id, token, error);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const current = [...slots.values()];
      setSlots(new Map());
      for (const slot of current)
        if (slot.kind === "starting") slot.controller.abort();
      handOver();
      disposeAll(
        current.flatMap((slot) =>
          slot.kind === "running" ? [slot.instance] : [],
        ),
      );
    },
  };
}

function tokenOf<T>(slot: Slot<T> | undefined): object | null {
  return slot && slot.kind !== "failed" ? slot.token : null;
}
