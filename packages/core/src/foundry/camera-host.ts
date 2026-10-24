import type {
  CamerasHost,
  CamerasPlacement,
  CamerasSurfaceDefinition,
} from "@modular-av/api";

type CameraViewsBase = abstract new (...args: never[]) => object;

/** The parts of Foundry's `CameraViews` (and ApplicationV2) the host overrides. */
interface CameraViewsLike {
  readonly element: HTMLElement | null;
  render(options?: object): Promise<unknown>;
  _configureRenderOptions(options: { parts?: readonly string[] }): void;
  _configureRenderParts(options: object): Record<string, object>;
  _renderHTML(context: object, options: object): Promise<unknown>;
  _replaceHTML(result: unknown, content: HTMLElement, options: object): void;
  readonly hidden: boolean;
  readonly isVertical: boolean;
  readonly isHorizontal: boolean;
  setUserIsSpeaking(userId: string, speaking: boolean): void;
  getUserVideoElement(userId: string): HTMLVideoElement | null;
}

/** What the host needs from the core, known once Foundry's `setup` ran. */
export interface CamerasHosting {
  /** The surface this client mounts, or null for Foundry's dock. */
  readonly surface: CamerasSurfaceDefinition | null;
  placement(): CamerasPlacement;
  setPlacement(placement: CamerasPlacement): Promise<void>;
  /** The surface is mounted: the core's plain status steps aside. */
  mounted(): void;
  /** Mounting threw: Foundry's dock is shown instead. */
  failed(error: unknown): void;
}

/**
 * The core's own camera dock host for `CONFIG.ui.webrtc`. `AVMaster` calls
 * `ui.webrtc.render()` and `setUserIsSpeaking()`, so whatever shows the
 * cameras must stay a `CameraViews`. With no `cameras` surface it is
 * Foundry's dock unchanged. With one, it renders none of Foundry's parts
 * and hands its element to the surface, once; Foundry still places the
 * element next to its interface on every render.
 */
export function createCameraHostClass(
  base: CameraViewsBase,
  hosting: () => CamerasHosting | null,
): CameraViewsBase {
  const Base = base as unknown as new (...args: unknown[]) => CameraViewsLike;
  // Not private members: Foundry's constructor may call overridden methods
  // before a subclass's own members exist.
  const states = new WeakMap<object, "mounted" | "failed">();

  /** Mounted or about to be: Foundry's parts stay out. */
  const active = (views: object): CamerasHosting | null => {
    const h = hosting();
    return h?.surface && states.get(views) !== "failed" ? h : null;
  };

  const mount = (
    views: CameraViewsLike,
    h: CamerasHosting,
    content: HTMLElement,
  ): void => {
    const surface = h.surface;
    if (states.has(views) || !surface) return;
    const host: CamerasHost = Object.freeze({
      element: content,
      get placement() {
        return h.placement();
      },
      setPlacement: (placement: CamerasPlacement) => h.setPlacement(placement),
    });
    try {
      surface.mount(host);
      states.set(views, "mounted");
      h.mounted();
    } catch (error: unknown) {
      states.set(views, "failed");
      content.replaceChildren();
      h.failed(error);
      // The render under way drew nothing: Foundry's dock comes next.
      queueMicrotask(() => {
        void views.render({ force: true });
      });
    }
  };

  const placed = (views: object): CamerasPlacement | null =>
    active(views)?.placement() ?? null;

  return class ModularAVCameraViews extends Base {
    override _configureRenderOptions(options: {
      parts?: readonly string[];
    }): void {
      super._configureRenderOptions(options);
      // Foundry's own handling of per-player parts doesn't apply.
      if (active(this)) options.parts = [];
    }

    override _configureRenderParts(options: object): Record<string, object> {
      return active(this) ? {} : super._configureRenderParts(options);
    }

    override _renderHTML(context: object, options: object): Promise<unknown> {
      return active(this)
        ? Promise.resolve({})
        : super._renderHTML(context, options);
    }

    override _replaceHTML(
      result: unknown,
      content: HTMLElement,
      options: object,
    ): void {
      const h = active(this);
      if (h) mount(this, h, content);
      else super._replaceHTML(result, content, options);
    }

    override get hidden(): boolean {
      return active(this) ? false : super.hidden;
    }

    override get isVertical(): boolean {
      const placement = placed(this);
      return placement
        ? placement === "left" || placement === "right"
        : super.isVertical;
    }

    override get isHorizontal(): boolean {
      const placement = placed(this);
      return placement
        ? placement === "top" || placement === "bottom"
        : super.isHorizontal;
    }

    /** The surface shows speaking from the core's state. */
    override setUserIsSpeaking(userId: string, speaking: boolean): void {
      if (!active(this)) super.setUserIsSpeaking(userId, speaking);
    }

    override getUserVideoElement(userId: string): HTMLVideoElement | null {
      return active(this) ? null : super.getUserVideoElement(userId);
    }
  };
}
