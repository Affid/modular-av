/** The background image couldn't be loaded, decoded or used. */
export class ImageLoadError extends Error {
  override readonly name = "ImageLoadError";
}
