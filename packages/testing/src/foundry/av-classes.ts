import type { FakeAVSettings } from "./av-settings.ts";

/**
 * Stand-ins for the Foundry classes a client class and a camera dock
 * subclass: `foundry.av.AVClient` and
 * `foundry.applications.apps.av.CameraViews`.
 */

const missing = (name: string): Error =>
  new Error(`The ${name}() method must be defined by an AVClient subclass.`);

const abstract = (name: string): never => {
  throw missing(name);
};

/** Foundry's abstract methods are `async`: they reject, not throw. */
const abstractAsync = (name: string): Promise<never> =>
  Promise.reject(missing(name));

export interface FakeAVMasterLike {
  readonly settings: FakeAVSettings;
  /** Not in Foundry, which reads `game.user.id`: the fake has no globals. */
  readonly selfId: string;
}

/** v14 client/av/client.mjs, without device discovery. */
export class FakeAVClient {
  readonly master: FakeAVMasterLike;
  readonly settings: FakeAVSettings;

  constructor(master: FakeAVMasterLike, settings: FakeAVSettings) {
    this.master = master;
    this.settings = settings;
  }

  get isVoicePTT(): boolean {
    return this.settings.client.voice.mode === "ptt";
  }

  get isVoiceAlways(): boolean {
    return this.settings.client.voice.mode === "always";
  }

  get isVoiceActivated(): boolean {
    return this.settings.client.voice.mode === "activity";
  }

  get isMuted(): boolean {
    return this.settings.client.users[this.master.selfId]?.muted ?? false;
  }

  initialize(): Promise<void> {
    return abstractAsync("initialize");
  }

  connect(): Promise<boolean> {
    return abstractAsync("connect");
  }

  disconnect(): Promise<boolean> {
    return abstractAsync("disconnect");
  }

  getAudioSinks(): Promise<Record<string, string>> {
    return Promise.resolve({});
  }

  getAudioSources(): Promise<Record<string, string>> {
    return Promise.resolve({});
  }

  getVideoSources(): Promise<Record<string, string>> {
    return Promise.resolve({});
  }

  getConnectedUsers(): string[] {
    return abstract("getConnectedUsers");
  }

  getMediaStreamForUser(_userId: string): MediaStream | null {
    return abstract("getMediaStreamForUser");
  }

  getLevelsStreamForUser(_userId: string): MediaStream | null {
    return abstract("getLevelsStreamForUser");
  }

  isAudioEnabled(): boolean {
    return abstract("isAudioEnabled");
  }

  isVideoEnabled(): boolean {
    return abstract("isVideoEnabled");
  }

  toggleAudio(_enable: boolean): void {
    abstract("toggleAudio");
  }

  toggleBroadcast(_broadcast: boolean): void {
    abstract("toggleBroadcast");
  }

  toggleVideo(_enable: boolean): void {
    abstract("toggleVideo");
  }

  setUserVideo(_userId: string, _element: HTMLVideoElement): Promise<void> {
    return abstractAsync("setUserVideo");
  }

  onSettingsChanged(_changed: Readonly<Record<string, unknown>>): void {
    // Foundry\'s default does nothing.
  }

  updateLocalStream(): Promise<void> {
    return abstractAsync("updateLocalStream");
  }
}

export interface CameraRender {
  readonly force?: boolean;
  readonly parts?: readonly string[];
}

/** v14 applications/apps/av/cameras.mjs, as far as AVMaster uses it. */
export class FakeCameraViews {
  renders: readonly CameraRender[] = [];
  speaking: Readonly<Record<string, boolean>> = {};

  render(options: CameraRender = {}): Promise<this> {
    this.renders = [...this.renders, options];
    return Promise.resolve(this);
  }

  setUserIsSpeaking(userId: string, speaking: boolean): void {
    this.speaking = { ...this.speaking, [userId]: speaking };
  }

  getUserVideoElement(_userId: string): HTMLVideoElement | null {
    return null;
  }
}

/**
 * The client class `CONFIG.WebRTC.clientClass` starts as, standing in for
 * Foundry's SimplePeer client: connects, sends nothing.
 */
export class FakeDefaultAVClient extends FakeAVClient {
  override initialize(): Promise<void> {
    return Promise.resolve();
  }

  override connect(): Promise<boolean> {
    return Promise.resolve(true);
  }

  override disconnect(): Promise<boolean> {
    return Promise.resolve(true);
  }

  override getConnectedUsers(): string[] {
    return [this.master.selfId];
  }

  override getMediaStreamForUser(): MediaStream | null {
    return null;
  }

  override getLevelsStreamForUser(): MediaStream | null {
    return null;
  }

  override isAudioEnabled(): boolean {
    return false;
  }

  override isVideoEnabled(): boolean {
    return false;
  }

  override toggleAudio(): void {
    // Sends nothing.
  }

  override toggleBroadcast(): void {
    // Sends nothing.
  }

  override toggleVideo(): void {
    // Sends nothing.
  }

  override setUserVideo(): Promise<void> {
    return Promise.resolve();
  }

  override updateLocalStream(): Promise<void> {
    return Promise.resolve();
  }
}
