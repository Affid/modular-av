import { clamp } from "./rect.ts";

/** The slice of Foundry's settings a saved number uses. */
export interface SettingsApi {
  register(
    namespace: string,
    key: string,
    config: Readonly<Record<string, unknown>>,
  ): void;
  get(namespace: string, key: string): unknown;
  set(namespace: string, key: string, value: unknown): Promise<unknown>;
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

/** Saved for this device. What it reads is always within `range`. */
export function clientNumber(
  settings: SettingsApi,
  moduleId: string,
  key: string,
  range: NumberRange,
): NumberSetting {
  const inRange = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value)
      ? clamp(value, range.min, range.max)
      : range.value;
  let listeners: readonly ((value: number) => void)[] = [];
  const read = (): number => inRange(settings.get(moduleId, key));
  settings.register(moduleId, key, {
    scope: "client",
    config: false,
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
