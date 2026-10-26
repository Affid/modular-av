import type { SettingsApi } from "../src/settings.ts";
import { MODULE_ID } from "../src/settings.ts";

type Config = Readonly<Record<string, unknown>> & {
  readonly default?: unknown;
  readonly onChange?: (value: unknown) => void;
};

/** Foundry's settings, as much as this module uses: stored per key. */
export function fakeSettings(): SettingsApi & {
  configs(): Readonly<Record<string, Config>>;
  /** Saves a value without its onChange, as if it was there at load. */
  store(key: string, value: unknown): void;
} {
  const configs = new Map<string, Config>();
  const values = new Map<string, unknown>();
  const full = (namespace: string, key: string): string =>
    `${namespace}.${key}`;
  return {
    register(namespace, key, config) {
      configs.set(full(namespace, key), config);
    },
    get(namespace, key) {
      const id = full(namespace, key);
      return values.has(id) ? values.get(id) : configs.get(id)?.default;
    },
    set(namespace, key, value) {
      const id = full(namespace, key);
      values.set(id, value);
      configs.get(id)?.onChange?.(value);
      return Promise.resolve(value);
    },
    configs: () =>
      Object.fromEntries(
        [...configs].map(([id, c]) => [id.slice(MODULE_ID.length + 1), c]),
      ),
    store(key, value) {
      values.set(full(MODULE_ID, key), value);
    },
  };
}
