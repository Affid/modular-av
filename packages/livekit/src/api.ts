import type { Observable } from "@modular-av/api";
import type { LiveKitRoom } from "./rooms.ts";

/**
 * `game.modules.get("modular-av-livekit").api`: this module's own API for
 * add-ons such as `modular-av-livekit-krisp`, versioned with this module.
 */
export interface LiveKitModuleApi {
  /** The joined room (a livekit-client `Room`), null between calls. */
  readonly room: Observable<LiveKitRoom | null>;
}

export function createModuleApi(
  room: Observable<LiveKitRoom | null>,
): LiveKitModuleApi {
  return Object.freeze({ room });
}
