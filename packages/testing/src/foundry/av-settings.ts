import { getProperty, mergeObject, setProperty } from "./objects.ts";
import type { FakeUsers } from "./users.ts";

/** `foundry.av.AVSettings.AV_MODES`. */
export const AV_MODES = {
  DISABLED: 0,
  AUDIO: 1,
  VIDEO: 2,
  AUDIO_VIDEO: 3,
} as const;

export type VoiceMode = "always" | "activity" | "ptt";

export interface AVWorldSettings {
  readonly mode: number;
  readonly turn: {
    readonly type: "server" | "custom";
    readonly url: string;
    readonly username: string;
    readonly password: string;
  };
}

/** One entry of `client.users`, as stored. */
export interface AVUserEntry {
  readonly popout: boolean;
  readonly volume: number;
  readonly muted: boolean;
  readonly hidden: boolean;
  readonly blocked: boolean;
}

export interface AVClientSettings {
  readonly videoSrc: string;
  readonly audioSrc: string;
  readonly audioSink: string;
  readonly muteAll: boolean;
  readonly disableVideo: boolean;
  readonly hideDock: boolean;
  readonly dockPosition: "top" | "right" | "bottom" | "left";
  readonly voice: {
    readonly mode: VoiceMode;
    readonly pttName: string;
    readonly pttDelay: number;
    readonly activityThreshold: number;
  };
  readonly users: Readonly<Record<string, Partial<AVUserEntry>>>;
}

/** What `AVSettings#getUser` returns. */
export interface AVUserSettings extends AVUserEntry {
  readonly canBroadcastAudio: boolean;
  readonly canBroadcastVideo: boolean;
  readonly speaking: boolean | undefined;
}

export interface AVActivity {
  readonly muted?: boolean;
  readonly hidden?: boolean;
  readonly speaking?: boolean;
}

export type AVSettingsDiff = Readonly<Record<string, unknown>>;

/** A stand-in for `game.webrtc.settings` (v14 client/av/settings.mjs). */
export interface FakeAVSettings {
  readonly world: AVWorldSettings;
  readonly client: AVClientSettings;
  readonly activity: Readonly<Record<string, AVActivity>>;
  get(scope: "world" | "client", path: string): unknown;
  /** Applies at once in memory; `onSettingsChanged` follows in a microtask. */
  set(scope: "world" | "client", path: string, value: unknown): void;
  getUser(userId: string): AVUserSettings | null;
  handleUserActivity(userId: string, activity: AVActivity): void;
}

export const DEFAULT_AV_WORLD: AVWorldSettings = {
  mode: AV_MODES.AUDIO_VIDEO,
  turn: { type: "server", url: "", username: "", password: "" },
};

export const DEFAULT_AV_CLIENT: AVClientSettings = {
  videoSrc: "default",
  audioSrc: "default",
  audioSink: "default",
  muteAll: false,
  disableVideo: false,
  hideDock: false,
  dockPosition: "left",
  voice: { mode: "ptt", pttName: "`", pttDelay: 100, activityThreshold: -45 },
  users: {},
};

const DEFAULT_USER: AVUserEntry = {
  popout: false,
  volume: 1,
  muted: false,
  hidden: false,
  blocked: false,
};

export interface AVSettingsDeps {
  readonly selfId: string;
  readonly users: FakeUsers;
  readonly client: Partial<AVClientSettings>;
  /** The shared world settings and how a GM writes them. */
  readWorld(): AVWorldSettings;
  writeWorld(path: string, value: unknown): void;
  /** The A/V client, for the local user's muted/hidden fallbacks. */
  avClient(): { isAudioEnabled(): boolean; isVideoEnabled(): boolean } | null;
  /** Called with the diff, as `AVMaster#onSettingsChanged` is. */
  onChanged(changed: AVSettingsDiff): void;
  /** `ui.webrtc`, which activity updates also reach. */
  cameraViews(): {
    setUserIsSpeaking(id: string, speaking: boolean): void;
  } | null;
}

export interface FakeAVSettingsHandle {
  readonly settings: FakeAVSettings;
  /** The world settings changed (on any client): diff for this one. */
  worldChanged(path: string, value: unknown): void;
}

export function createAVSettings(deps: AVSettingsDeps): FakeAVSettingsHandle {
  let client: AVClientSettings = {
    ...DEFAULT_AV_CLIENT,
    ...deps.client,
  };
  let activity: Readonly<Record<string, AVActivity>> = { [deps.selfId]: {} };
  let pending: AVSettingsDiff | null = null;

  /** Real Foundry debounces by 100 ms twice; a microtask keeps tests simple. */
  const queueChange = (changed: AVSettingsDiff): void => {
    const first = pending === null;
    pending = mergeObject(pending ?? {}, changed);
    if (!first) return;
    queueMicrotask(() => {
      const diff = pending ?? {};
      pending = null;
      deps.onChanged(diff);
    });
  };

  const settings: FakeAVSettings = {
    get world() {
      return deps.readWorld();
    },
    get client() {
      return client;
    },
    get activity() {
      return activity;
    },
    get(scope, path) {
      return getProperty(scope === "world" ? deps.readWorld() : client, path);
    },
    set(scope, path, value) {
      if (scope === "world") {
        deps.writeWorld(path, value);
        return;
      }
      client = setProperty(client, path, value);
      queueChange(setProperty({}, `client.${path}`, value));
    },
    getUser(userId) {
      const user = deps.users.get(userId);
      if (!user) return null;
      const entry = { ...DEFAULT_USER, ...client.users[userId] };
      const own = activity[userId] ?? {};
      const avClient = deps.avClient();
      const isSelf = userId === deps.selfId;
      return {
        ...entry,
        canBroadcastAudio: user.can("BROADCAST_AUDIO"),
        canBroadcastVideo: user.can("BROADCAST_VIDEO"),
        muted:
          entry.muted ||
          (isSelf ? !(avClient?.isAudioEnabled() ?? false) : !!own.muted),
        hidden:
          entry.hidden ||
          (isSelf ? !(avClient?.isVideoEnabled() ?? false) : !!own.hidden),
        speaking: own.speaking,
      };
    },
    handleUserActivity(userId, update) {
      const current = activity[userId] ?? {};
      activity = { ...activity, [userId]: { ...current, ...update } };
      if (update.speaking !== undefined)
        deps.cameraViews()?.setUserIsSpeaking(userId, update.speaking);
    },
  };

  return {
    settings,
    worldChanged(path, value) {
      queueChange(setProperty({}, `world.${path}`, value));
    },
  };
}
