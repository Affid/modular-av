import { describe, expect, it, vi } from "vitest";
import { createModuleApi } from "../src/api.ts";
import { CLOUD_FEATURE, featuresOf } from "../src/cloud.ts";
import { createRooms } from "../src/rooms.ts";

describe("what a LiveKit server offers", () => {
  it("names LiveKit Cloud by the server's edition", () => {
    expect(featuresOf({ edition: 1 })).toEqual([CLOUD_FEATURE]);
    expect(CLOUD_FEATURE).toBe("livekit-cloud");
  });

  it("offers nothing more on a self-hosted server", () => {
    expect(featuresOf({ edition: 0 })).toEqual([]);
    expect(featuresOf({})).toEqual([]);
  });

  it("offers nothing when the server didn't say", () => {
    expect(featuresOf(undefined)).toEqual([]);
  });
});

describe("the current room", () => {
  it("tells listeners about each joined room and when it is gone", () => {
    // Arrange
    const rooms = createRooms();
    const seen = vi.fn();
    rooms.observable.subscribe(seen);
    const first = { name: "first" };
    const second = { name: "second" };

    // Act
    rooms.set(first);
    rooms.set(second);
    rooms.clear(second);

    // Assert
    expect(seen.mock.calls).toEqual([[first], [second], [null]]);
    expect(rooms.observable.get()).toBeNull();
  });

  it("ignores a room that left after the next one joined", () => {
    const rooms = createRooms();
    const old = { name: "old" };
    const current = { name: "current" };
    rooms.set(old);
    rooms.set(current);

    rooms.clear(old);

    expect(rooms.observable.get()).toBe(current);
  });

  it("stops telling a listener that unsubscribed", () => {
    const rooms = createRooms();
    const seen = vi.fn();
    const off = rooms.observable.subscribe(seen);

    off();
    rooms.set({});

    expect(seen).not.toHaveBeenCalled();
  });

  it("keeps telling the others when a listener throws", () => {
    const errors: unknown[] = [];
    const rooms = createRooms((error) => errors.push(error));
    const after = vi.fn();
    rooms.observable.subscribe(() => {
      throw new Error("broken listener");
    });
    rooms.observable.subscribe(after);

    rooms.set({});

    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
  });
});

describe("the module's API", () => {
  it("hands out the current room, frozen", () => {
    const rooms = createRooms();

    const api = createModuleApi(rooms.observable);

    expect(Object.isFrozen(api)).toBe(true);
    expect(api.room).toBe(rooms.observable);
  });
});
