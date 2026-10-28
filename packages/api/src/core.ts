import type { AVCommands } from "./commands.ts";
import type { Contribution } from "./contributions.ts";
import type { EffectDefinition } from "./effects.ts";
import type { Meters } from "./meters.ts";
import type { Previews } from "./preview.ts";
import type { Registry } from "./registry.ts";
import type {
  ConnectionStats,
  ParticipantId,
  ServiceDefinition,
} from "./service.ts";
import type { Channel } from "./socket.ts";
import type { AVState } from "./state.ts";
import type { Store } from "./store.ts";
import type { SurfaceDefinition } from "./surfaces.ts";
import type { Windows } from "./windows.ts";

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

/** The connection details a UI shows on request, never polled by the core. */
export interface Stats {
  /**
   * This client's connection (`null`), or the media from one participant,
   * as the service measures it; the same answer for a second, however
   * often asked. Rejects with a CommandError: "not-ready" outside a call,
   * "unknown-participant" for someone not in it, "unsupported" when the
   * service can't tell per participant.
   */
  get(participant: ParticipantId | null): Promise<ConnectionStats>;
}

/**
 * The core's public API on `game.modules.get("modular-av").api`. Its
 * version is the core's module version, so Foundry's dependency checks
 * apply to the API.
 */
export interface ModularAV {
  readonly version: string;
  readonly state: Store<AVState>;
  readonly commands: AVCommands;
  readonly media: MediaAttachment;
  readonly meters: Meters;
  /** Cameras and microphones previewed outside the call. */
  readonly preview: Previews;
  readonly windows: Windows;
  readonly stats: Stats;
  readonly services: Registry<ServiceDefinition>;
  readonly effects: Registry<EffectDefinition>;
  readonly surfaces: Registry<SurfaceDefinition>;
  readonly contributions: Registry<Contribution>;
  socket(channel: string): Channel;
  /** A module file's URL through Foundry's route prefix. */
  assetUrl(moduleId: string, path: string): string;
}
