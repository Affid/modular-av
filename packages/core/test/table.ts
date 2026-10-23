import type { ModularAV, ServiceDefinition } from "@modular-av/api";
import {
  type AVClientSettings,
  createFakeMediaEnv,
  createFakeWorld,
  createMockServiceHub,
  type FakeClient,
  type FakeMediaEnv,
  type FakeWorld,
  type FakeWorldOptions,
  type MockServiceHub,
} from "@modular-av/testing";
import { vi } from "vitest";
import { type InstalledCore, installCore } from "../src/core.ts";
import en from "../lang/en.json" with { type: "json" };

/** A table of players, each a browser tab running the core. */
export const USERS = [
  { id: "gm", name: "Gamemaster", role: 4 },
  { id: "gm2", name: "Gamemaster2", role: 4 },
  { id: "p1", name: "Player1", role: 2 },
  { id: "p4", name: "Player4", role: 1 },
] as const;

export interface Tab {
  readonly client: FakeClient;
  readonly env: FakeMediaEnv;
  readonly core: InstalledCore;
  readonly api: ModularAV;
  readonly errors: unknown[];
}

export interface TabOptions {
  /** This device holds the service secret (a GM's browser). */
  readonly secret?: boolean;
  readonly av?: Partial<AVClientSettings>;
  /** Register no service at all. */
  readonly noService?: boolean;
  readonly deny?: { readonly audio?: string; readonly video?: string };
}

export interface Table {
  readonly world: FakeWorld;
  readonly hub: MockServiceHub;
  join(userId: string, options?: TabOptions): Tab;
  /** Delivers socket messages and runs due timers and promises. */
  settle(): Promise<void>;
}

let nextId = 0;

function serviceFor(hub: MockServiceHub, secret: boolean): ServiceDefinition {
  return { ...hub.definition(), canSignTokens: () => secret };
}

export function createTable(options: Partial<FakeWorldOptions> = {}): Table {
  const world = createFakeWorld({
    users: USERS,
    modules: [{ id: "modular-av", version: "0.1.0" }],
    translations: en,
    ...options,
  });
  const hub = createMockServiceHub({ now: () => Date.now() });

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i += 1) {
      await world.settle();
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  const join = (userId: string, tab: TabOptions = {}): Tab => {
    const client = world.connect(userId, tab.av ? { av: tab.av } : {});
    const env = createFakeMediaEnv(tab.deny ? { deny: tab.deny } : {});
    const errors: unknown[] = [];
    if (!tab.noService)
      client.Hooks.on("modularAV.register", (api: ModularAV) => {
        api.services.register(serviceFor(hub, tab.secret ?? false));
      });
    const core = installCore({
      game: client.game,
      hooks: client.Hooks,
      config: client.CONFIG,
      foundry: client.foundry,
      ui: () => client.ui,
      env,
      now: () => Date.now(),
      randomId: () => `id-${String(nextId++)}`,
      onError: (e) => errors.push(e),
    });
    client.runLifecycle();
    return { client, env, core, api: core.api, errors };
  };

  return { world, hub, join, settle };
}
