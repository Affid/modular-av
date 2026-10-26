import type { Compositor } from "./compositor.ts";
import { type Crop, coverCrop } from "./math.ts";

export interface ImageDeps<I> {
  readonly compositor: Compositor;
  /** Crops and scales the image to the frame's size. */
  readonly scale: (
    image: I,
    crop: Crop,
    width: number,
    height: number,
  ) => Promise<TexImageSource>;
  readonly size: (image: I) => { width: number; height: number };
  /** Frees an image (a decoded bitmap) no longer needed. */
  readonly release?: (image: I | TexImageSource) => void;
  readonly onError: (error: unknown) => void;
}

export interface BackgroundImage<I> {
  /** Another image; the old one stays drawn until the new one is scaled. */
  set(image: I | null): void;
  /** Scales the image for this frame size, once per size. */
  fit(width: number, height: number): void;
  close(): void;
}

/** The replacing image: scaled once per frame size, freed once replaced. */
export function createBackgroundImage<I>(
  first: I | null,
  deps: ImageDeps<I>,
): BackgroundImage<I> {
  let image = first;
  /** The size the image was scaled for. */
  let scaledFor = "";
  let closed = false;
  return {
    set(next) {
      if (image && image !== next) deps.release?.(image);
      image = next;
      scaledFor = "";
      if (!next) deps.compositor.setImage(null);
    },
    fit(width, height) {
      const key = `${String(width)}x${String(height)}`;
      if (!image || scaledFor === key) return;
      scaledFor = key;
      const source = image;
      const { width: w, height: h } = deps.size(source);
      deps
        .scale(source, coverCrop(w, h, width, height), width, height)
        .then((scaled) => {
          // A newer image (or none) came meanwhile: this one is stale.
          if (image === source && !closed) deps.compositor.setImage(scaled);
          deps.release?.(scaled);
        }, deps.onError);
    },
    close() {
      closed = true;
      if (image) deps.release?.(image);
      image = null;
    },
  };
}
