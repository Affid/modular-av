import { clamp } from "./rect.ts";

/**
 * The core's `api.settings`, as far as a saved number uses it: a setting is
 * kept for the "player" (it follows their login) or the "device".
 */
export interface StoredSettings {
  register(
    module: string,
    key: string,
    setting: {
      readonly storage: "player" | "device";
      readonly type: NumberConstructor;
      readonly default: number;
      readonly onChange?: (value: unknown) => void;
    },
  ): void;
  get(module: string, key: string): unknown;
  set(module: string, key: string, value: unknown): Promise<void>;
}

export interface NumberRange {
  readonly min: number;
  readonly max: number;
  /** Where it starts, and what a malformed saved value reads as. */
  readonly value: number;
}

export interface NumberSetting {
  get(): number;
  subscribe(listener: (value: number) => void): () => void;
  set(value: number): Promise<void>;
}

/** Kept as `storage` says. What it reads is always within `range`. */
export function savedNumber(
  settings: StoredSettings,
  moduleId: string,
  key: string,
  range: NumberRange,
  storage: "player" | "device",
): NumberSetting {
  const inRange = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value)
      ? clamp(value, range.min, range.max)
      : range.value;
  let listeners: readonly ((value: number) => void)[] = [];
  const read = (): number => inRange(settings.get(moduleId, key));
  settings.register(moduleId, key, {
    storage,
    type: Number,
    default: range.value,
    onChange: () => {
      const value = read();
      for (const listener of listeners) listener(value);
    },
  });
  return {
    get: read,
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((l) => l !== listener);
      };
    },
    async set(value) {
      await settings.set(moduleId, key, inRange(value));
    },
  };
}
