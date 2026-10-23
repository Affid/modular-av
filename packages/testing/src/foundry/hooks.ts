// eslint-disable-next-line @typescript-eslint/no-explicit-any -- hooks take any arguments, as in Foundry
type HookHandler = (...args: any[]) => unknown;

interface Registration {
  readonly id: number;
  readonly fn: HookHandler;
  readonly once: boolean;
}

export interface HookError {
  readonly hook: string;
  readonly error: unknown;
}

export interface FakeHooks {
  on(hook: string, fn: HookHandler): number;
  once(hook: string, fn: HookHandler): number;
  off(hook: string, fnOrId: HookHandler | number): void;
  /** Stops at the first handler that returns `false` and returns `false`. */
  call(hook: string, ...args: unknown[]): boolean;
  callAll(hook: string, ...args: unknown[]): boolean;
  /** Errors thrown by handlers; Foundry logs them and carries on. */
  readonly errors: readonly HookError[];
}

/** A stand-in for Foundry's `Hooks` with the same calling rules. */
export function createHooks(): FakeHooks {
  let nextId = 1;
  let registry = new Map<string, readonly Registration[]>();
  let errors: readonly HookError[] = [];

  const add = (hook: string, fn: HookHandler, once: boolean): number => {
    const id = nextId++;
    registry = new Map(registry).set(hook, [
      ...(registry.get(hook) ?? []),
      { id, fn, once },
    ]);
    return id;
  };

  const remove = (hook: string, match: (r: Registration) => boolean): void => {
    const remaining = (registry.get(hook) ?? []).filter((r) => !match(r));
    registry = new Map(registry).set(hook, remaining);
  };

  const run = (
    hook: string,
    args: unknown[],
    stopOnFalse: boolean,
  ): boolean => {
    for (const registration of registry.get(hook) ?? []) {
      if (registration.once) remove(hook, (r) => r.id === registration.id);
      try {
        if (registration.fn(...args) === false && stopOnFalse) return false;
      } catch (error: unknown) {
        errors = [...errors, { hook, error }];
      }
    }
    return true;
  };

  return {
    on: (hook, fn) => add(hook, fn, false),
    once: (hook, fn) => add(hook, fn, true),
    off: (hook, fnOrId) => {
      remove(hook, (r) =>
        typeof fnOrId === "number" ? r.id === fnOrId : r.fn === fnOrId,
      );
    },
    call: (hook, ...args) => run(hook, args, true),
    callAll: (hook, ...args) => run(hook, args, false),
    get errors() {
      return errors;
    },
  };
}
