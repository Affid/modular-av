type CameraViewsBase = abstract new (...args: never[]) => object;

/**
 * The core's own camera dock host for `CONFIG.ui.webrtc`. `AVMaster` calls
 * `ui.webrtc.render()` and `setUserIsSpeaking()`, so whatever shows the
 * cameras must stay a `CameraViews`. With no `cameras` surface (milestone
 * 5) it is Foundry's dock unchanged; ApplicationV2 still fires the
 * `renderCameraViews` hooks for subclasses.
 */
export function createCameraHostClass(base: CameraViewsBase): CameraViewsBase {
  const Base = base as unknown as new (...args: unknown[]) => object;
  return class ModularAVCameraViews extends Base {};
}
