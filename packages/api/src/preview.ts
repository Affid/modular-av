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
}

export interface CameraPreviewOptions {
  /** A device id, or "default" for the system's. */
  readonly device: string;
  /** A video effect's id, or null for the camera as it is. */
  readonly effect: string | null;
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
