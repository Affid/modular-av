import type {
  AVState,
  LocalState,
  MediaPermissions,
  ServiceDefinition,
} from "@modular-av/api";
import type { Runtime } from "../call/runtime.ts";
import type { AVFacts } from "../foundry/av-facts.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import type { LocalMedia } from "../media/local-media.ts";
import type { RemoteMedia } from "../media/remote-media.ts";
import type { WritableStore } from "../store.ts";
import { project } from "./project.ts";

export interface StateSyncDeps {
  readonly store: WritableStore<AVState>;
  readonly game: FoundryGame;
  readonly facts: AVFacts;
  readonly rt: Runtime;
  readonly local: LocalMedia;
  readonly remote: RemoteMedia;
  readonly service: () => ServiceDefinition | undefined;
  readonly outbound: () => MediaPermissions;
}

function localState(deps: StateSyncDeps): LocalState {
  const { facts, local } = deps;
  const own = facts.entry(facts.selfId);
  return {
    muted: own.muted ?? false,
    videoEnabled: !(own.hidden ?? false),
    deafened: deps.rt.deafened,
    broadcasting: deps.outbound().audio,
    voiceMode: facts.voiceMode(),
    canPublish: facts.canBroadcast(facts.selfId),
    hasMicrophone: local.microphone !== null,
    hasCamera: local.camera !== null,
    microphoneError: local.errors.audio,
    cameraError: local.errors.video,
  };
}

/** Returns the function that rebuilds the store's state from its sources. */
export function createStateSync(deps: StateSyncDeps): () => void {
  const { store, game, facts, rt, remote } = deps;
  return () => {
    store.update((previous) =>
      project(
        {
          facts,
          users: game.users.contents,
          session: rt.session,
          service: {
            id: deps.service()?.id ?? null,
            capabilities: rt.capabilities,
          },
          local: localState(deps),
          connected: rt.connected,
          speaking: rt.speaking,
          hasMedia: (id, kind) => remote.has(id, kind),
        },
        previous,
      ),
    );
  };
}
