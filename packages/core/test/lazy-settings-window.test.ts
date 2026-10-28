import { describe, expect, it } from "vitest";
import { lazySettingsWindow } from "../src/foundry/lazy-settings-window.ts";

const window = () => {
  const renders: unknown[] = [];
  return {
    renders,
    element: null,
    options: {},
    render: (options?: object) => {
      renders.push(options);
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  };
};

describe("the settings window, loaded on first open", () => {
  it("loads once, and opens Foundry's own window when its code can't load", async () => {
    // Arrange
    const real = window();
    const foundry = window();
    const errors: unknown[] = [];
    let loads = 0;
    const lazy = lazySettingsWindow(
      () => {
        loads += 1;
        return loads === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(real);
      },
      foundry,
      (error) => errors.push(error),
    );

    // Act
    await lazy.render({ force: true });
    await lazy.render({ force: true });
    await lazy.render({ force: true });

    // Assert
    expect(foundry.renders).toEqual([{ force: true }]);
    expect(errors).toHaveLength(1);
    expect(real.renders).toHaveLength(2);
    expect(loads).toBe(2);
  });
});
