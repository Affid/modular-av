import type { ParticipantId } from "./service.ts";

export interface MeterReading {
  /** dBFS, -100 to 0. */
  readonly db: number;
  /** The local player's voice gate threshold (dBFS); null for others. */
  readonly threshold: number | null;
  /** Whether the local player's voice gate is open; null for others. */
  readonly open: boolean | null;
}

/**
 * Sound levels, kept out of the state: they change 20 times a second. The
 * local player's comes from the voice gate (the microphone after its
 * effects, before the mute); another player's from what this client plays
 * of them, so there is none for someone it may not hear.
 */
export interface Meters {
  /**
   * Calls `listener` about 20 times a second, but only while `element` is
   * on screen in a visible document (the Picture-in-Picture window
   * counts), so a hidden meter costs nothing. Stops by itself once
   * `element` leaves its document.
   */
  subscribe(
    participant: ParticipantId,
    element: Element,
    listener: (reading: MeterReading) => void,
  ): () => void;
}
