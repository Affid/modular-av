import type { AVCommands } from "./commands.ts";
import type { Contribution } from "./contributions.ts";
import type {
  EffectDefinition,
  AudioEffectHost,
  AudioEffectHostOptions,
} from "./effects.ts";
import type { Meters } from "./meters.ts";
import type { Previews } from "./preview.ts";
import type { Registry } from "./registry.ts";
import type { ModuleSettings } from "./settings.ts";
import type {
  ConnectionStats,
  ParticipantId,
  ServiceDefinition,
} from "./service.ts";
import type { Channel } from "./socket.ts";
import type { AudioSource, AVState } from "./state.ts";
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
  /**
   * A copy of a participant's sound, for recording, transcription or
   * captions. For another player it is what this client plays of them, as
   * received, before this client's volume; for the local player, what
   * they send. `listener` gets a new copy whenever there is a new track,
   * and null when it goes: out of the call, blocked by a GM, or muted,
   * hidden or deafened here, so expect gaps. The local player's is null
   * too while they are muted or push to talk is released; another player
   * who mutes themselves keeps their track, so the copy goes silent
   * rather than null. Until a first track
   * comes it isn't called at all. The core stops a copy once it hands the
   * next one or null, and the last one at the returned call; stopping or
   * disabling a copy never touches what is played or sent. `moduleId` is
   * the asking module's id, as it declares it (the core can't check who
   * calls): an inactive or unknown module, or an unknown source, throws.
   * Each player decides: until they allow this module on this browser
   * (asked by default, or allowed or refused for every module) the
   * listener gets null. Every player sees which modules receive voices,
   * and is told each time one starts receiving theirs (`voiceCopies` in
   * the state). A module that records or transcribes voices tells the
   * people it records.
   */
  audio(
    moduleId: string,
    participant: ParticipantId,
    source: AudioSource,
    listener: (track: MediaStreamTrack | null) => void,
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
  /** Modules' own settings, each kept for the player or for the device. */
  readonly settings: ModuleSettings;
  socket(channel: string): Channel;
  /** A module file's URL through Foundry's route prefix. */
  assetUrl(moduleId: string, path: string): string;
  /**
   * What `AudioEffectContext.host` is, for a context of your own: an
   * effect's own tests and previews, rendered offline.
   */
  createAudioEffectHost(
    context: BaseAudioContext,
    options: AudioEffectHostOptions,
  ): AudioEffectHost;
}
