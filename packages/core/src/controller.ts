import type {
  AVState,
  EffectDefinition,
  MediaPermissions,
  ParticipantId,
  Registry,
  ServiceConnection,
  ServiceDefinition,
  VideoSource,
} from "@modular-av/api";
import { createCall } from "./call/call.ts";
import { createRuntime, type Runtime } from "./call/runtime.ts";
import {
  createVoiceActivity,
  type VoiceActivity,
} from "./call/voice-activity.ts";
import { MODULE_ID } from "./constants.ts";
import { AV_MODES, type AVFacts, createAVFacts } from "./foundry/av-facts.ts";
import type { FoundryGame, FoundryHooks } from "./foundry/globals.ts";
import type { MediaEnv } from "./media/env.ts";
import {
  createEffectChoices,
  type EffectChoices,
} from "./media/effect-choices.ts";
import { createLocalMedia, type LocalMedia } from "./media/local-media.ts";
import { readSensitivity } from "./media/sensitivity.ts";
import { createRemoteMedia, type RemoteMedia } from "./media/remote-media.ts";
import type { DeviceChoice } from "./media/local-media.ts";
import {
  computeOutbound,
  createPlaybackPolicy,
  gateConfig,
  wantedDevices,
} from "./media/rules.ts";
import type { Session } from "./session/session.ts";
import type { Channels } from "./socket.ts";
import { DEAFENED_FLAG } from "./state/project.ts";
import { createStateSync } from "./state/sync.ts";
import type { WritableStore } from "./store.ts";

export const DEAFENED_SETTING = "deafened";

export interface ControllerDeps {
  /** Created before the controller, so the API can expose it from `init`. */
  readonly store: WritableStore<AVState>;
  readonly game: FoundryGame;
  readonly hooks: FoundryHooks;
  readonly env: MediaEnv;
  readonly channels: Channels;
  readonly services: Registry<ServiceDefinition>;
  readonly effects: Registry<EffectDefinition>;
  /** The id in the world's service setting. */
  readonly selectedService: () => string;
  readonly renderDock: () => void;
  readonly onError: (error: unknown) => void;
  readonly now: () => number;
  readonly randomId: () => string;
}

/** What the A/V client class, the commands and the core's hooks call. */
export interface Controller {
  readonly store: WritableStore<AVState>;
  readonly session: Session;
  readonly facts: AVFacts;
  readonly local: LocalMedia;
  readonly remote: RemoteMedia;
  service(): ServiceDefinition | undefined;
  /** The live connection, or null between connections. */
  connection(): ServiceConnection | null;
  /** AVMaster: before `connect()`, awaited. */
  initialize(): Promise<void>;
  foundryConnect(): void;
  foundryDisconnect(): Promise<void>;
  ready(): void;
  setBroadcastIntent(intent: boolean): void;
  setDeafened(deafened: boolean): Promise<void>;
  connectedUsers(): ParticipantId[];
  attach(
    id: ParticipantId,
    source: VideoSource,
    el: HTMLVideoElement,
  ): () => void;
  reacquire(): Promise<void>;
  onAVSettingsChanged(changedKeys: readonly string[]): void;
  /** Recomputes outbound media, playback and state. */
  apply(): void;
  /** Rebuilds the state only, e.g. after others' Foundry activity. */
  refresh(): void;
  setEffectEnabled(id: string, enabled: boolean): Promise<void>;
}

interface Parts {
  readonly deps: ControllerDeps;
  readonly facts: AVFacts;
  readonly rt: Runtime;
  readonly local: LocalMedia;
  readonly remote: RemoteMedia;
  readonly session: Session;
  readonly service: () => ServiceDefinition | undefined;
  readonly apply: () => void;
  readonly refresh: () => void;
  readonly reacquire: () => Promise<void>;
  readonly voice: VoiceActivity;
  readonly choices: EffectChoices;
}

/**
 * Whether the local player's publish rights changed since the last call,
 * whatever changed them (their user, their role's permissions, the world's
 * mode). Tokens carry the rights, so the session must rejoin.
 */
function rightsChanged(rt: Runtime, facts: AVFacts): boolean {
  const rights = facts.canBroadcast(facts.selfId);
  const before = rt.rights;
  rt.rights = rights;
  return (
    before !== null &&
    (before.audio !== rights.audio || before.video !== rights.video)
  );
}

const sameDevices = (a: DeviceChoice, b: DeviceChoice): boolean =>
  a.audio === b.audio && a.video === b.video;

interface DeviceSync {
  /** Captures what is wanted now, whatever was asked before. */
  readonly acquire: () => Promise<void>;
  /** Captures again only if what is wanted changed. */
  sync(): void;
}

function createDeviceSync(
  deps: Pick<ControllerDeps, "env" | "onError">,
  parts: { facts: AVFacts; rt: Runtime; local: LocalMedia },
  refreshState: () => void,
): DeviceSync {
  const { facts, rt, local } = parts;
  const { onError } = deps;
  let requested: DeviceChoice | null = null;
  /** Labels appear once a device of that kind was granted: list again. */
  const listDevices = (): void => {
    deps.env
      .listDevices()
      .then((devices) => {
        rt.devices = devices;
        refreshState();
      })
      .catch(onError);
  };
  deps.env.onDeviceChange(listDevices);
  const acquire = async (): Promise<void> => {
    requested = wantedDevices(facts, rt.session.status);
    try {
      await local.acquire(requested);
    } finally {
      listDevices();
    }
  };
  return {
    acquire,
    sync() {
      const next = wantedDevices(facts, rt.session.status);
      if (requested && sameDevices(requested, next)) return;
      acquire().catch(onError);
    },
  };
}

function buildParts(deps: ControllerDeps): Parts {
  const { game, env } = deps;
  const facts = createAVFacts(game);
  const rt = createRuntime(
    game.settings.get(MODULE_ID, DEAFENED_SETTING) === true,
  );
  const service = (): ServiceDefinition | undefined =>
    deps.services.get(deps.selectedService()) ?? deps.services.list()[0];
  // Created after `local`, which reports replaced effects to it.
  let choices: EffectChoices | null = null;
  const local = createLocalMedia(env, {
    gate: gateConfig(facts, readSensitivity(game)),
    onReplaced: (ids) => choices?.replaced(ids),
    onError: deps.onError,
  });
  choices = createEffectChoices({
    ...{ game, env, effects: deps.effects, local },
    features: () => rt.features,
    onError: deps.onError,
  });
  const remote = createRemoteMedia(
    env,
    createPlaybackPolicy(facts, () => rt.deafened),
    (participant, source, options) => {
      rt.connection?.setSubscription(participant, source, options);
    },
    deps.onError,
  );
  const outbound = (): MediaPermissions =>
    computeOutbound({
      facts,
      intent: rt.intent,
      deafened: rt.deafened,
      hasMicrophone: local.microphone !== null,
      hasCamera: local.camera !== null,
    });
  const refreshState = createStateSync({
    ...{ store: deps.store, game, facts, rt, local, remote },
    ...{ service, outbound, effects: deps.effects },
    isSupported: choices.isSupported,
    isAvailable: choices.isAvailable,
  });
  remote.onChange(refreshState);
  const devices = createDeviceSync(deps, { facts, rt, local }, refreshState);
  const session = createCall({
    ...deps,
    ...{ facts, rt, local, remote, service, outbound },
    // The session's status decides which devices run.
    refreshState: () => {
      refreshState();
      devices.sync();
    },
    onFeatures: () => {
      choices.apply();
    },
  });
  // Created after `apply`, which it calls.
  let voice: VoiceActivity | null = null;
  const announce = createActivityAnnouncer(game, facts, local);
  const apply = (): void => {
    devices.sync();
    local.setGate(gateConfig(facts, readSensitivity(game)));
    local.setOutbound(outbound());
    remote.refresh();
    // Tokens carry the rights; without one, publishing follows them as is.
    const rejoin =
      rightsChanged(rt, facts) && service()?.needsToken() !== false;
    if (rejoin) session.restart();
    else session.syncMedia();
    voice?.sync();
    announce();
    refreshState();
  };
  local.onChange(() => {
    remote.setLocalVideo(facts.selfId, local.camera);
    apply();
  });
  const reacquire = devices.acquire;
  voice = createVoiceActivity({ game, facts, rt, local, apply });
  choices.apply();
  return {
    ...{ deps, facts, rt, local, remote, session, service, apply, reacquire },
    ...{ refresh: refreshState, voice, choices },
  };
}

interface OwnActivity {
  readonly muted: boolean;
  readonly hidden: boolean;
}

/**
 * Tells the others whether this player is muted or hidden, as Foundry
 * computes it (the setting, or nothing being sent). Foundry broadcasts it
 * only when its A/V settings load or change, so before the core captured
 * any device every player looked muted and hidden to the others.
 */
function createActivityAnnouncer(
  game: FoundryGame,
  facts: AVFacts,
  local: LocalMedia,
): () => void {
  let announced: OwnActivity | null = null;
  return () => {
    if (!game.ready) return;
    const own = facts.entry(facts.selfId);
    const next: OwnActivity = {
      muted: (own.muted ?? false) || local.microphone === null,
      hidden: (own.hidden ?? false) || local.camera === null,
    };
    if (announced?.muted === next.muted && announced.hidden === next.hidden)
      return;
    announced = next;
    game.user.broadcastActivity({ av: next });
  };
}

/**
 * A/V disabled: stop and free the devices. Otherwise capture what the new
 * mode needs; the rights change makes `apply()` rejoin. Enabling A/V after
 * it was disabled at load needs a reload, which Foundry asks for.
 */
function onModeChanged(parts: Parts): void {
  const { facts, rt, session, local } = parts;
  if (facts.mode() === AV_MODES.DISABLED) {
    void session.stop(null);
    local.release();
    return;
  }
  if (rt.foundryConnected) parts.reacquire().catch(parts.deps.onError);
}

function onSettingsChanged(parts: Parts, keys: readonly string[]): void {
  const has = (prefix: string): boolean =>
    keys.some((k) => k === prefix || k.startsWith(`${prefix}.`));
  // A TURN change never gets here: AVMaster reconnects (disconnect, then
  // connect) without telling the client class.
  if (has("world.mode")) onModeChanged(parts);
  else if (has("client.audioSrc") || has("client.videoSrc"))
    parts.reacquire().catch(parts.deps.onError);
  parts.apply();
}

/** Keeps the user flag others read in step with this device's setting. */
function syncDeafenedFlag(parts: Parts): void {
  const { game, onError } = parts.deps;
  const flag = game.user.getFlag(MODULE_ID, DEAFENED_FLAG) === true;
  if (flag !== parts.rt.deafened)
    game.user
      .setFlag(MODULE_ID, DEAFENED_FLAG, parts.rt.deafened)
      .catch(onError);
}

export function createController(deps: ControllerDeps): Controller {
  const parts = buildParts(deps);
  const { game } = deps;
  const { facts, rt, local, remote, session, apply } = parts;
  const startIfReady = (): void => {
    if (rt.foundryConnected && game.ready) session.start();
  };
  return {
    ...{ store: deps.store, session, facts, local, remote, apply },
    service: parts.service,
    connection: () => rt.connection,
    reacquire: parts.reacquire,
    refresh: parts.refresh,
    setEffectEnabled: (id, enabled) => parts.choices.setEnabled(id, enabled),
    initialize: parts.reacquire,
    foundryConnect() {
      rt.foundryConnected = true;
      startIfReady();
    },
    async foundryDisconnect() {
      rt.foundryConnected = false;
      await session.stop(null);
    },
    ready() {
      startIfReady();
      syncDeafenedFlag(parts);
      apply();
    },
    setBroadcastIntent(intent) {
      parts.voice.onIntent(intent);
    },
    async setDeafened(deafened) {
      rt.deafened = deafened;
      apply();
      await game.settings.set(MODULE_ID, DEAFENED_SETTING, deafened);
      await game.user.setFlag(MODULE_ID, DEAFENED_FLAG, deafened);
    },
    connectedUsers: () => [
      facts.selfId,
      ...[...rt.connected].filter(
        (id) => id !== facts.selfId && game.users.get(id)?.active,
      ),
    ],
    attach: (id, source, el) => remote.attach(id, source, el),
    onAVSettingsChanged: (keys) => {
      onSettingsChanged(parts, keys);
    },
  };
}
