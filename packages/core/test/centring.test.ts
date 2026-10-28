// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  centreAsContentGrows,
  centreUntilMoved,
} from "../src/foundry/centring.ts";

const CENTRE = { top: undefined, left: undefined };

describe("centreUntilMoved", () => {
  it("centres the window each time its content settles, while nobody moved it", () => {
    const follow = centreUntilMoved();

    expect(follow.next({ top: 100, left: 300 })).toEqual(CENTRE);
    follow.placed({ top: 400, left: 300 });
    // The real content arrived: it grew, still where it was centred.
    expect(follow.next({ top: 400, left: 300 })).toEqual(CENTRE);
  });

  it("notices a move made to the very object Foundry handed back", () => {
    const follow = centreUntilMoved();
    const position = { top: 400, left: 300 };
    follow.next(position);
    follow.placed(position);

    position.top = 120;

    expect(follow.next(position)).toEqual({});
  });

  it("leaves a window the player moved where they put it", () => {
    const follow = centreUntilMoved();
    follow.next({ top: 100, left: 300 });
    follow.placed({ top: 400, left: 300 });

    expect(follow.next({ top: 120, left: 80 })).toEqual({});
    follow.placed({ top: 120, left: 80 });
    expect(follow.next({ top: 120, left: 80 })).toEqual({});
  });
});

describe("centreAsContentGrows", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("centres the window each time its content changes size, until the player moves it", () => {
    // Arrange: a window, and its content's resizes reported by hand.
    let resized = (): void => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      },
    );
    const position = { top: 100, left: 300 };
    const asked: object[] = [];
    const app = {
      position,
      setPosition(target: object) {
        asked.push(target);
        if ("top" in target) Object.assign(position, { top: 50, left: 200 });
        return position;
      },
    };
    const content = document.createElement("div");

    // Act
    centreAsContentGrows(app, content);
    resized(); // empty
    resized(); // the board arrived
    position.top = 400; // the player dragged it
    resized();

    // Assert
    expect(asked).toEqual([
      { top: undefined, left: undefined },
      { top: undefined, left: undefined },
      {},
    ]);
  });
});
