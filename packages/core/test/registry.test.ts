import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "../src/registry.ts";

describe("registry", () => {
  it("accepts definitions only while open and lists them in order", () => {
    // Arrange
    const registry = createRegistry<{ id: string; n: number }>("services");
    registry.open();

    // Act
    registry.api.register({ id: "a", n: 1 });
    registry.api.register({ id: "b", n: 2 });
    registry.close();

    // Assert
    expect(registry.api.list().map((d) => d.id)).toEqual(["a", "b"]);
    expect(registry.api.get("b")?.n).toBe(2);
    expect(registry.api.get("c")).toBeUndefined();
  });

  it("explains late and early registration", () => {
    const registry = createRegistry<{ id: string }>("services");

    expect(() => {
      registry.api.register({ id: "a" });
    }).toThrow(/services: register .* inside the "modularAV.register" hook/);
    registry.open();
    registry.close();
    expect(() => {
      registry.api.register({ id: "a" });
    }).toThrow(/"a" registered too late/);
  });

  it("rejects duplicate and malformed ids", () => {
    const registry = createRegistry<{ id: string }>("services");
    registry.open();
    registry.api.register({ id: "a" });

    expect(() => {
      registry.api.register({ id: "a" });
    }).toThrow(/"a" is already registered/);
    expect(() => {
      registry.api.register({ id: "" });
    }).toThrow(/needs an id/);
  });

  it("tells listeners about each registration until they unsubscribe", () => {
    const registry = createRegistry<{ id: string }>("services");
    const listener = vi.fn();
    const off = registry.api.onChange(listener);
    registry.open();

    registry.api.register({ id: "a" });
    off();
    registry.api.register({ id: "b" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([{ id: "a" }]);
  });
});
