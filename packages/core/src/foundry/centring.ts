/** Where a window is, as Foundry's ApplicationV2 keeps it. */
export interface Spot {
  readonly top?: number | undefined;
  readonly left?: number | undefined;
}

/** The parts of a Foundry window that place it. */
export interface Placeable {
  readonly position?: Spot;
  /** Foundry keeps the window on screen whenever it is positioned. */
  setPosition?(position?: object): Spot | undefined;
}

/**
 * Where to put the window each time its content settles: centred again
 * while it is where it was last put (its content loads in steps), left
 * where the player moved it after that, only kept on screen.
 */
export function centreUntilMoved(): {
  next(current: Spot): object;
  placed(spot: Spot | undefined): void;
} {
  let last: Spot | null = null;
  let moved = false;
  return {
    next(current) {
      moved ||=
        last !== null &&
        (current.top !== last.top || current.left !== last.left);
      return moved ? {} : { top: undefined, left: undefined };
    },
    // A copy: Foundry hands back its own position, which it changes later.
    placed(spot) {
      last = spot ? { top: spot.top, left: spot.left } : null;
    },
  };
}

/**
 * Centres `app` again each time `content` changes size (a window filled
 * after Foundry placed it grows downwards off the screen otherwise),
 * until the player moves it. Null where there is no ResizeObserver.
 */
export function centreAsContentGrows(
  app: Placeable,
  content: Element,
): ResizeObserver | null {
  const view = content.ownerDocument.defaultView;
  if (!view?.ResizeObserver) return null;
  const follow = centreUntilMoved();
  const observer = new view.ResizeObserver(() => {
    follow.placed(app.setPosition?.(follow.next(app.position ?? {})));
  });
  observer.observe(content);
  return observer;
}
