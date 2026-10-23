import { describe, expect, it, vi } from "vitest";
import { createHooks } from "../src/foundry/hooks.ts";

describe("fake Hooks", () => {
  it("calls handlers in registration order with the arguments", () => {
    // Arrange
    const hooks = createHooks();
    const calls: string[] = [];
    hooks.on("init", (value: unknown) => calls.push(`a:${String(value)}`));
    hooks.on("init", (value: unknown) => calls.push(`b:${String(value)}`));

    // Act
    hooks.callAll("init", 1);

    // Assert
    expect(calls).toEqual(["a:1", "b:1"]);
  });

  it("runs a once handler a single time", () => {
    const hooks = createHooks();
    const handler = vi.fn();
    hooks.once("ready", handler);

    hooks.callAll("ready");
    hooks.callAll("ready");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removes handlers by id or by function", () => {
    const hooks = createHooks();
    const byId = vi.fn();
    const byFn = vi.fn();
    const id = hooks.on("x", byId);
    hooks.on("x", byFn);

    hooks.off("x", id);
    hooks.off("x", byFn);
    hooks.callAll("x");

    expect(byId).not.toHaveBeenCalled();
    expect(byFn).not.toHaveBeenCalled();
  });

  it("stops call() when a handler returns false, but not callAll()", () => {
    const hooks = createHooks();
    const later = vi.fn();
    hooks.on("x", () => false);
    hooks.on("x", later);

    const called = hooks.call("x");
    const calledAll = hooks.callAll("x");

    expect(called).toBe(false);
    expect(calledAll).toBe(true);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("records a throwing handler and keeps calling the rest, like Foundry", () => {
    const hooks = createHooks();
    const later = vi.fn();
    hooks.on("x", () => {
      throw new Error("boom");
    });
    hooks.on("x", later);

    hooks.callAll("x");

    expect(later).toHaveBeenCalled();
    expect(hooks.errors).toHaveLength(1);
    expect(hooks.errors[0]?.hook).toBe("x");
  });

  it("returns true from call() when no handler is registered", () => {
    expect(createHooks().call("nothing")).toBe(true);
  });
});
