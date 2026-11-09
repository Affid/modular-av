import type { VideoResolution } from "./state.ts";

/**
 * Local previews for a settings window, outside the call: never sent to
 * anyone, so a player can check a camera or a microphone before a session,
 * with calls off, or as a GM setting a world up. The call's own devices
 * don't change: its camera still runs only while video can go out.
 */
export interface Previews {
  /**
   * Shows `device`'s camera in `element`, through the video effect named
   * `effect` if given, until stopped or until `element` leaves its
   * document. Rejects as `getUserMedia` does (its error's name:
   * NotAllowedError, NotFoundError…), or with a CommandError
   * ("unknown-effect", "unsupported") for an effect that can't run here. An
   * effect that fails later calls `onFailed` and the preview goes blank, as
   * the call keeps a camera off whose effect isn't running.
   */
  camera(
    element: HTMLVideoElement,
    options: CameraPreviewOptions,
  ): Promise<Preview>;
  /**
   * `device`'s level, in dBFS (-100 to 0), about 20 times a second, timed
   * in `element`'s window, until stopped or until `element` leaves its
   * document. Rejects as `getUserMedia` does.
   */
  microphone(
    element: Element,
    options: MicrophonePreviewOptions,
  ): Promise<Preview>;
  /**
   * What would be sent, after every effect and the voice gate, for playing it
   * back to the player. While its track is live, Mute and the push to talk
   * key don't silence it; what is sent still follows them. Null
   * without a microphone. Unlike the others this is the call's own audio, not
   * a device's. Stop its track when done, which leaves what is sent as it is.
   */
  voice(): MediaStream | null;
}

export interface CameraPreviewOptions {
  /** A device id, or "default" for the system's. */
  readonly device: string;
  /** A video effect's id, or null for the camera as it is. */
  readonly effect: string | null;
  /**
   * The size asked of the camera, as the call asks it; the browser's own
   * without one. A browser opens a camera once for every capture of it, at
   * the size the first asked, so a preview left open can keep the call's
   * camera at its size: stop it while that changes.
   */
  readonly resolution?: VideoResolution;
  readonly onFailed?: (error: unknown) => void;
}

export interface MicrophonePreviewOptions {
  /** A device id, or "default" for the system's. */
  readonly device: string;
  readonly listener: (db: number) => void;
}

export interface Preview {
  /** Releases the device; the element goes blank. */
  stop(): void;
}
