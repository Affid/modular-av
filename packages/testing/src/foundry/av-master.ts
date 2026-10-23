import type { FakeAVClient } from "./av-classes.ts";
import {
  AV_MODES,
  type AVSettingsDiff,
  type FakeAVSettings,
} from "./av-settings.ts";
import { flattenKeys, getProperty } from "./objects.ts";

export type AVClientClass = new (
  master: FakeAVMaster,
  settings: FakeAVSettings,
) => FakeAVClient;

export interface AVMasterDeps {
  readonly selfId: string;
  readonly settings: FakeAVSettings;
  readonly clientClass: AVClientClass;
  /** `ui.webrtc`, read when needed as Foundry does. */
  cameraViews(): {
    render(options?: object): unknown;
    setUserIsSpeaking(id: string, speaking: boolean): void;
  } | null;
  broadcastActivity(activity: Readonly<Record<string, unknown>>): void;
}

/**
 * A stand-in for `game.webrtc` following v14 client/av/master.mjs: how it
 * drives the client class at connect, on settings changes, on push to talk
 * and from its own voice detection. `reportSpeech` plays the part of the
 * level reports `game.audio` would make on the levels stream.
 */
export class FakeAVMaster {
  readonly selfId: string;
  readonly settings: FakeAVSettings;
  readonly client: FakeAVClient;
  broadcasting = false;
  /** The stream voice detection runs on, or null when it doesn't run. */
  detectionStream: MediaStream | null = null;
  readonly #deps: AVMasterDeps;
  #connected = false;
  #connecting: Promise<boolean> | null = null;
  #detectedSpeaking = false;
  #pttTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: AVMasterDeps) {
    this.#deps = deps;
    this.selfId = deps.selfId;
    this.settings = deps.settings;
    this.client = new deps.clientClass(this, deps.settings);
  }

  get mode(): number {
    return this.settings.world.mode;
  }

  get connected(): boolean {
    return this.#connected;
  }

  connect(): Promise<boolean> {
    if (this.#connecting) return this.#connecting;
    const run = async (): Promise<boolean> => {
      await this.disconnect();
      if (this.mode === AV_MODES.DISABLED) return false;
      await this.client.initialize();
      const connected = await this.client.connect();
      if (!connected) return false;
      this.#initialize();
      this.#connected = connected;
      return connected;
    };
    this.#connecting = run().finally(() => {
      this.#connecting = null;
    });
    return this.#connecting;
  }

  async disconnect(): Promise<boolean> {
    if (!this.#connected) return false;
    this.#connected = false;
    await this.client.disconnect();
    return true;
  }

  #initialize(): void {
    const client = this.settings.client;
    const mode = client.voice.mode;
    this._initializeUserVoiceDetection(mode);
    this.#detectedSpeaking = false;
    const isAlways = mode === "always";
    this.client.toggleAudio(
      isAlways && !!client.audioSrc && this.canUserShareAudio(this.selfId),
    );
    this.client.toggleVideo(
      !!client.videoSrc && this.canUserShareVideo(this.selfId),
    );
    this.broadcast(isAlways);
    this.#deps.cameraViews()?.render();
  }

  canUserBroadcastAudio(userId: string): boolean {
    if (this.mode === AV_MODES.DISABLED || this.mode === AV_MODES.VIDEO)
      return false;
    return this.settings.getUser(userId)?.canBroadcastAudio ?? false;
  }

  canUserShareAudio(userId: string): boolean {
    if (this.mode === AV_MODES.DISABLED || this.mode === AV_MODES.VIDEO)
      return false;
    const user = this.settings.getUser(userId);
    return !!user && user.canBroadcastAudio && !(user.muted || user.blocked);
  }

  canUserBroadcastVideo(userId: string): boolean {
    if (this.mode === AV_MODES.DISABLED || this.mode === AV_MODES.AUDIO)
      return false;
    return this.settings.getUser(userId)?.canBroadcastVideo ?? false;
  }

  canUserShareVideo(userId: string): boolean {
    if (this.mode === AV_MODES.DISABLED || this.mode === AV_MODES.AUDIO)
      return false;
    const user = this.settings.getUser(userId);
    return !!user && user.canBroadcastVideo && !(user.hidden || user.blocked);
  }

  broadcast(intent: boolean): void {
    this.broadcasting = intent && this.canUserShareAudio(this.selfId);
    this.client.toggleBroadcast(this.broadcasting);
    const activity = this.settings.activity[this.selfId] ?? {};
    if (activity.speaking !== this.broadcasting)
      this.#deps.broadcastActivity({ av: { speaking: this.broadcasting } });
    this.settings.handleUserActivity(this.selfId, {
      speaking: this.broadcasting,
    });
    this.#deps.cameraViews()?.setUserIsSpeaking(this.selfId, this.broadcasting);
  }

  _initializeUserVoiceDetection(mode: string): void {
    this.detectionStream = null;
    if (mode !== "always" && mode !== "activity") return;
    const stream = this.client.getLevelsStreamForUser(this.selfId);
    if (!stream?.getAudioTracks().some((t) => t.enabled)) return;
    this.detectionStream = stream;
  }

  /** As `#onAudioLevel` deciding the user is or isn't speaking. */
  reportSpeech(speaking: boolean): void {
    if (!this.detectionStream) return;
    const isSpeaking = speaking && !this.client.isMuted;
    if (isSpeaking === this.#detectedSpeaking) return;
    this.#detectedSpeaking = isSpeaking;
    if (this.client.isVoiceActivated) this.broadcast(isSpeaking);
  }

  _onPTTStart(): boolean {
    if (!this.#connected) return false;
    const voice = this.settings.client.voice;
    clearTimeout(this.#pttTimeout);
    if (voice.mode === "ptt") this.broadcast(true);
    else
      this.#pttTimeout = setTimeout(() => {
        this.broadcast(false);
      }, voice.pttDelay);
    return true;
  }

  _onPTTEnd(): boolean {
    if (!this.#connected) return false;
    const voice = this.settings.client.voice;
    clearTimeout(this.#pttTimeout);
    if (voice.mode === "ptt")
      this.#pttTimeout = setTimeout(() => {
        this.broadcast(false);
      }, voice.pttDelay);
    else this.broadcast(true);
    return true;
  }

  onSettingsChanged(changed: AVSettingsDiff): void {
    // v14 checks `keys.includes("world.turn")` on fully flattened keys
    // ("world.turn.url", …), so a TURN change never reconnects here.
    if (flattenKeys(changed).includes("world.turn")) {
      void this.connect();
      return;
    }
    const sharing = getProperty(changed, `client.users.${this.selfId}`);
    if (typeof sharing === "object" && sharing !== null) {
      if ("hidden" in sharing)
        this.client.toggleVideo(this.canUserShareVideo(this.selfId));
      if ("muted" in sharing)
        this.client.toggleAudio(this.canUserShareAudio(this.selfId));
    }
    this.client.onSettingsChanged(changed);
  }
}
