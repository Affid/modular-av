import type {
  EffectDefinition,
  ModularAV,
  ServiceDefinition,
} from "@modular-av/api";
import {
  type AVClientSettings,
  createFakeMediaEnv,
  createFakeWorld,
  createMockServiceHub,
  type FakeAVMaster,
  type FakeCaptureContext,
  type FakeClient,
  type FakeMediaEnv,
  type FakeWorld,
  type FakeWorldOptions,
  type MockServiceHub,
  fakeTrackInfo,
} from "@modular-av/testing";
import { vi } from "vitest";
import { type InstalledCore, installCore } from "../src/core.ts";
// Loaded lazily by the core; preloaded so its import resolves within settle().
import "../src/media/microphone.ts";
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
  /** Register this instead of the mock service's definition. */
  readonly service?: ServiceDefinition;
  readonly deny?: { readonly audio?: string; readonly video?: string };
  readonly effects?: readonly EffectDefinition[];
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
        api.services.register(
          tab.service ?? serviceFor(hub, tab.secret ?? false),
        );
      });
    client.Hooks.on("modularAV.register", (api: ModularAV) => {
      for (const effect of tab.effects ?? []) api.effects.register(effect);
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

export const micOf = (tab: Tab): MediaStreamTrack | null =>
  tab.core.controller().local.microphone;

export const micEnabled = (tab: Tab): boolean | undefined => {
  const mic = micOf(tab);
  return mic ? fakeTrackInfo(mic).enabled : undefined;
};

export const master = (tab: Tab): FakeAVMaster => {
  const webrtc = tab.client.game.webrtc;
  if (!webrtc) throw new Error("no game.webrtc");
  return webrtc;
};

/** The track another tab's core plays for `from`'s microphone. */
export const heard = (listener: Tab, from: Tab): MediaStreamTrack | null => {
  const mine = micOf(from);
  return (
    listener.env.outputs.find((o) => o.state.track === mine)?.state.track ??
    null
  );
};

export const ALWAYS = {
  voice: {
    mode: "always",
    pttName: "`",
    pttDelay: 100,
    activityThreshold: -45,
  },
} as const;

/** The tab's capture context, once its microphone is in. */
export const captureOf = (tab: Tab): FakeCaptureContext => {
  const capture = tab.env.captureContexts[0];
  if (!capture) throw new Error("no capture context yet");
  return capture;
};
