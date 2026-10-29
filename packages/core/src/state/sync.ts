import type {
  AVState,
  EffectDefinition,
  EffectState,
  LocalState,
  MediaPermissions,
  Registry,
  ServiceDefinition,
} from "@modular-av/api";
import type { Runtime } from "../call/runtime.ts";
import type { AVFacts } from "../foundry/av-facts.ts";
import type { FoundryGame } from "../foundry/globals.ts";
import type { LocalMedia } from "../media/local-media.ts";
import type { RemoteMedia } from "../media/remote-media.ts";
import type { WritableStore } from "../store.ts";
import { readSensitivity } from "../media/sensitivity.ts";
import { readGateFallback } from "../media/gate-fallback.ts";
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
  /** The gate can't run and the player chose to be muted, not heard. */
  readonly microphoneHeld: () => boolean;
  readonly effects: Registry<EffectDefinition>;
  readonly isSupported: (definition: EffectDefinition) => boolean;
  readonly isAvailable: (definition: EffectDefinition) => boolean;
}

const OFF: EffectState = { status: "off", error: null };
const UNSUPPORTED: EffectState = { status: "unsupported", error: null };
const UNAVAILABLE: EffectState = { status: "unavailable", error: null };

function effectState(deps: StateSyncDeps, d: EffectDefinition): EffectState {
  if (!deps.isSupported(d)) return UNSUPPORTED;
  if (!deps.isAvailable(d)) return UNAVAILABLE;
  return deps.local.effectStatus(d.id) ?? OFF;
}

function effectStates(
  deps: StateSyncDeps,
): Readonly<Record<string, EffectState>> {
  return Object.fromEntries(
    deps.effects.list().map((d) => [d.id, effectState(deps, d)]),
  );
}

/** Foundry saves "" until a device was picked: the system default. */
const orDefault = (id: string | undefined): string =>
  id === undefined || id === "" ? "default" : id;

function chosenDevices(facts: AVFacts): LocalState["chosenDevices"] {
  const client = facts.settings()?.client;
  return {
    audioInput: orDefault(client?.audioSrc),
    videoInput: orDefault(client?.videoSrc),
    audioOutput: orDefault(client?.audioSink),
  };
}

function localState(deps: StateSyncDeps): LocalState {
  const { facts, local } = deps;
  const own = facts.entry(facts.selfId);
  const voiceMode = facts.voiceMode();
  const sending = deps.outbound().audio;
  const gated = voiceMode === "activity" && local.gateRunning;
  return {
    muted: own.muted ?? false,
    videoEnabled: !(own.hidden ?? false),
    deafened: deps.rt.deafened,
    receiveVideo: !(facts.settings()?.client.disableVideo ?? false),
    broadcasting: sending && (!gated || deps.rt.gateOpen),
    voiceMode,
    canPublish: facts.canBroadcast(facts.selfId),
    hasMicrophone: local.microphone !== null,
    hasCamera: local.camera !== null,
    microphoneError: local.errors.audio,
    cameraError: local.errors.video,
    openMic: sending && voiceMode === "activity" && !local.gateRunning,
    gateFallback: readGateFallback(deps.game),
    microphoneHold: deps.microphoneHeld() ? "gate-failed" : null,
    speakingWhileMuted:
      deps.rt.sustainedSpeech &&
      local.microphone !== null &&
      ((own.muted ?? false) || deps.rt.deafened),
    effects: effectStates(deps),
    inputSensitivity: readSensitivity(deps.game),
    cameraHold: local.cameraHold,
    chosenDevices: chosenDevices(facts),
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
          devices: rt.devices,
          connected: rt.connected,
          speaking: rt.speaking,
          quality: rt.quality,
          hasMedia: (id, kind) => remote.has(id, kind),
        },
        previous,
      ),
    );
  };
}
