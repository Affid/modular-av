import type { Controller } from "../controller.ts";
import { flattenKeys } from "./keys.ts";

type AVClientBase = abstract new (...args: never[]) => object;

/**
 * Builds the class for `CONFIG.WebRTC.clientClass` on top of Foundry's
 * `AVClient`. `AVMaster` constructs it and drives it; everything is
 * delegated to the controller, which reads state from its own sources.
 */
export function createAVClientClass(
  base: AVClientBase,
  controller: () => Controller,
): AVClientBase {
  // Foundry's constructor takes (master, settings); the core reads both
  // through `game.webrtc` instead.
  const Base = base as unknown as new (...args: unknown[]) => object;

  return class ModularAVClient extends Base {
    initialize(): Promise<void> {
      return controller().initialize();
    }

    /** At once, so push to talk works and `reestablish()` never runs. */
    connect(): Promise<boolean> {
      controller().foundryConnect();
      return Promise.resolve(true);
    }

    async disconnect(): Promise<boolean> {
      await controller().foundryDisconnect();
      return true;
    }

    getConnectedUsers(): string[] {
      return controller().connectedUsers();
    }

    /** Video only: the core plays audio, so Foundry's dock never does. */
    getMediaStreamForUser(userId: string): MediaStream | null {
      return controller().remote.videoStream(userId);
    }

    getLevelsStreamForUser(userId: string): MediaStream | null {
      const c = controller();
      return userId === c.facts.selfId ? c.local.levelsStream : null;
    }

    isAudioEnabled(): boolean {
      return controller().local.microphone !== null;
    }

    isVideoEnabled(): boolean {
      return controller().local.camera !== null;
    }

    /** The core reads mute from `AVSettings` itself: this only re-applies. */
    toggleAudio(_enable: boolean): void {
      controller().apply();
    }

    toggleBroadcast(broadcast: boolean): void {
      controller().setBroadcastIntent(broadcast);
    }

    toggleVideo(_enable: boolean): void {
      controller().apply();
    }

    setUserVideo(userId: string, element: HTMLVideoElement): Promise<void> {
      controller().attach(userId, "camera", element);
      return Promise.resolve();
    }

    onSettingsChanged(changed: object): void {
      controller().onAVSettingsChanged(flattenKeys(changed));
    }

    updateLocalStream(): Promise<void> {
      return controller().reacquire();
    }
  };
}
