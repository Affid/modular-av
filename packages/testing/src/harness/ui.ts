// UI harness additions (?players=p1,p2): the other players of the call as
// full cores in the same page, on the same mock service and fake world,
// so their mute, deafen and speaking are real state the UI under test
// shows. They have no UI of their own.
import type { ModularAV } from "@modular-av/api";
import { installCore } from "../../../core/src/core.ts";
import { createBrowserMediaEnv } from "../../../core/src/media/browser-env.ts";
import { FakeCameraViews } from "../foundry/av-classes.ts";
import type { FakeWorld } from "../foundry/world.ts";
import type { MockServiceHub } from "../service/hub.ts";
import type { UIHarness } from "./ui-types.ts";

/** Their tabs draw nothing: the page is the GM's. */
class HeadlessCameraViews extends FakeCameraViews {
  override render(): Promise<this> {
    return Promise.resolve(this);
  }
}

const ALWAYS = {
  voice: {
    mode: "always",
    pttName: "`",
    pttDelay: 100,
    activityThreshold: -45,
  },
} as const;

let nextId = 0;

function startPlayer(
  world: FakeWorld,
  id: string,
  hub: MockServiceHub,
): ModularAV {
  const client = world.connect(id, { av: ALWAYS });
  client.Hooks.on("modularAV.register", (api: ModularAV) => {
    api.services.register({ ...hub.definition(), canSignTokens: () => false });
  });
  const core = installCore({
    game: client.game,
    hooks: client.Hooks,
    config: client.CONFIG,
    foundry: client.foundry,
    ui: () => client.ui,
    env: createBrowserMediaEnv((path) => `/modules/modular-av/${path}`),
    windows: {
      documentPip: () => null,
      preparePip: () => Promise.resolve(() => undefined),
    },
    now: () => Date.now(),
    randomId: () => `${id}-${String(nextId++)}`,
    onError: (error) => {
      // eslint-disable-next-line no-console -- the test page's log
      console.error(`harness player ${id}:`, error);
    },
  });
  client.CONFIG.ui.webrtc = HeadlessCameraViews;
  client.runLifecycle();
  return core.api;
}

/** Starts the other players once the page's own client is up. */
export function startPlayers(
  world: FakeWorld,
  ids: readonly string[],
  hub: MockServiceHub,
): UIHarness {
  const players = Object.fromEntries(
    ids.map((id) => [id, startPlayer(world, id, hub)]),
  );
  return { players, hub };
}
