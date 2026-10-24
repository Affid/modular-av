import type { Observable } from "@modular-av/api";

/**
 * The room of the current call, for add-ons that need LiveKit itself (the
 * Krisp filter checks the project and reports its use through it). It is
 * a livekit-client `Room`, typed loosely so this entry doesn't import the
 * SDK; null between calls.
 */
export type LiveKitRoom = object;

export interface Rooms {
  readonly observable: Observable<LiveKitRoom | null>;
  set(room: LiveKitRoom): void;
  /** `room` is gone; a newer one stays. */
  clear(room: LiveKitRoom): void;
}

export function createRooms(
  onError: (error: unknown) => void = () => undefined,
): Rooms {
  let current: LiveKitRoom | null = null;
  let listeners: readonly ((room: LiveKitRoom | null) => void)[] = [];
  const publish = (next: LiveKitRoom | null): void => {
    if (next === current) return;
    current = next;
    for (const listener of listeners)
      try {
        listener(next);
      } catch (error: unknown) {
        onError(error);
      }
  };
  return {
    observable: {
      get: () => current,
      subscribe(listener) {
        listeners = [...listeners, listener];
        return () => {
          listeners = listeners.filter((l) => l !== listener);
        };
      },
    },
    set: publish,
    clear(room) {
      if (room === current) publish(null);
    },
  };
}
