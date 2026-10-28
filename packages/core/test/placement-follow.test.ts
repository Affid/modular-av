import { describe, expect, it } from "vitest";
import { centreUntilMoved } from "../src/foundry/settings-host.ts";

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
