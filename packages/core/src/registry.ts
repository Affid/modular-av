import type { Registry } from "@modular-av/api";

export interface CoreRegistry<T extends { readonly id: string }> {
  readonly api: Registry<T>;
  open(): void;
  close(): void;
}

type Phase = "before" | "open" | "closed";

export function createRegistry<T extends { readonly id: string }>(
  name: string,
): CoreRegistry<T> {
  let phase: Phase = "before";
  let definitions: readonly T[] = [];
  /** Wrapped per registration, so each `onChange` undoes only itself. */
  let listeners: readonly {
    readonly listener: (definitions: readonly T[]) => void;
  }[] = [];

  const register = (definition: T): void => {
    const id = definition.id as unknown;
    if (typeof id !== "string" || id === "")
      throw new Error(`${name}: a definition needs an id`);
    if (phase === "before")
      throw new Error(
        `${name}: register "${id}" inside the "modularAV.register" hook`,
      );
    if (phase === "closed")
      throw new Error(
        `${name}: "${id}" registered too late; register synchronously inside the "modularAV.register" hook`,
      );
    if (definitions.some((d) => d.id === id))
      throw new Error(`${name}: "${id}" is already registered`);
    definitions = [...definitions, definition];
    for (const { listener } of listeners) listener(definitions);
  };

  const api: Registry<T> = Object.freeze({
    register,
    list: () => definitions,
    get: (id: string) => definitions.find((d) => d.id === id),
    onChange(listener: (definitions: readonly T[]) => void) {
      const registration = { listener };
      listeners = [...listeners, registration];
      return () => {
        listeners = listeners.filter((r) => r !== registration);
      };
    },
  });

  return {
    api,
    open() {
      phase = "open";
    },
    close() {
      phase = "closed";
    },
  };
}
