import type { AVCommands } from "./commands.ts";
import type { EffectDefinition } from "./effects.ts";
import type { Registry } from "./registry.ts";
import type { ParticipantId, ServiceDefinition } from "./service.ts";
import type { Channel } from "./socket.ts";
import type { AVState } from "./state.ts";
import type { Store } from "./store.ts";

export type VideoSource = "camera" | "screen";

export interface MediaAttachment {
  /**
   * Shows a participant's video in `element` and keeps it current. The
   * element never gets audio: the core plays that. Returns a detach
   * function; the core also detaches by itself when the element leaves its
   * document.
   */
  attach(
    participant: ParticipantId,
    source: VideoSource,
    element: HTMLVideoElement,
  ): () => void;
}

/**
 * The core's public API on `game.modules.get("modular-av").api`. Its
 * version is the core's module version, so Foundry's dependency checks
 * apply to the API. Milestone 5 adds meters, surfaces, contributions and
 * windows.
 */
export interface ModularAV {
  readonly version: string;
  readonly state: Store<AVState>;
  readonly commands: AVCommands;
  readonly media: MediaAttachment;
  readonly services: Registry<ServiceDefinition>;
  readonly effects: Registry<EffectDefinition>;
  socket(channel: string): Channel;
  /** A module file's URL through Foundry's route prefix. */
  assetUrl(moduleId: string, path: string): string;
}
