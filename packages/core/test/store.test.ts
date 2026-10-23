import { describe, expect, it, vi } from "vitest";
import { createStore } from "../src/store.ts";

const flush = (): Promise<void> => Promise.resolve();

describe("store", () => {
  it("returns the latest value at once and notifies in a microtask", async () => {
    // Arrange
    const store = createStore({ a: 1, b: 1 });
    const listener = vi.fn();
    store.subscribe((s) => s.a, listener);

    // Act
    store.update((s) => ({ ...s, a: 2 }));
    store.update((s) => ({ ...s, a: 3 }));

    // Assert
    expect(store.get().a).toBe(3);
    expect(listener).not.toHaveBeenCalled();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(3, 1);
  });

  it("skips listeners whose slice did not change", async () => {
    const store = createStore({ a: 1, b: 1 });
    const onA = vi.fn();
    store.subscribe((s) => s.a, onA);

    store.update((s) => ({ ...s, b: 2 }));
    store.update((s) => ({ ...s, a: 5 }));
    store.update((s) => ({ ...s, a: 1 }));
    await flush();

    expect(onA).not.toHaveBeenCalled();
  });

  it("uses a custom equality when given", async () => {
    const store = createStore({ list: [1] });
    const listener = vi.fn();
    store.subscribe((s) => s.list, listener, {
      equals: (x, y) => x.join() === y.join(),
    });

    store.update(() => ({ list: [1] }));
    await flush();
    store.update(() => ({ list: [2] }));
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe and survives a throwing listener", async () => {
    // Arrange
    const errors: unknown[] = [];
    const store = createStore({ a: 1 }, (error) => errors.push(error));
    const removed = vi.fn();
    const kept = vi.fn();
    store.subscribe(
      (s) => s.a,
      () => {
        throw new Error("boom");
      },
    );
    const unsubscribe = store.subscribe((s) => s.a, removed);
    store.subscribe((s) => s.a, kept);

    // Act
    unsubscribe();
    store.update(() => ({ a: 2 }));
    await flush();

    // Assert
    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledWith(2, 1);
    expect(errors).toEqual([new Error("boom")]);
  });

  it("lets a listener update the store and notifies again", async () => {
    const store = createStore({ a: 1, b: 0 });
    const onB = vi.fn();
    store.subscribe(
      (s) => s.a,
      (a) => {
        store.update((s) => ({ ...s, b: a * 10 }));
      },
    );
    store.subscribe((s) => s.b, onB);

    store.update((s) => ({ ...s, a: 2 }));
    await flush();
    await flush();

    expect(onB).toHaveBeenCalledWith(20, 0);
  });

  it("exposes a read-only view", () => {
    const store = createStore({ a: 1 });

    const view = store.view;

    expect(Object.keys(view).sort()).toEqual(["get", "subscribe"]);
    expect(Object.isFrozen(view)).toBe(true);
  });
});
