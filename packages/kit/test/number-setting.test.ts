import { describe, expect, it } from "vitest";
import { savedNumber, type StoredSettings } from "../src/number-setting.ts";

const RANGE = { min: 0.5, max: 3, value: 1.5 };

function fakeSettings(saved?: unknown) {
  let onChange: (value: unknown) => void = () => undefined;
  let value = saved;
  const storages: unknown[] = [];
  const settings: StoredSettings = {
    register(_module, _key, setting) {
      storages.push(setting.storage);
      if (saved === undefined) value = setting.default;
      onChange = setting.onChange ?? (() => undefined);
    },
    get: () => value,
    set(_module, _key, next) {
      value = next;
      onChange(next);
      return Promise.resolve();
    },
  };
  return { settings, storages };
}

describe("a saved number", () => {
  it("starts at its default, kept where it is declared", () => {
    const { settings, storages } = fakeSettings();

    const decay = savedNumber(settings, "my-module", "decay", RANGE, "player");
    savedNumber(settings, "my-module", "rate", RANGE, "device");

    expect(decay.get()).toBe(1.5);
    expect(storages).toEqual(["player", "device"]);
  });

  it("saves a change and tells who listens", async () => {
    // Arrange
    const { settings } = fakeSettings();
    const decay = savedNumber(settings, "my-module", "decay", RANGE, "player");
    const heard: number[] = [];
    decay.subscribe((value) => heard.push(value));

    // Act
    await decay.set(2);

    // Assert
    expect(decay.get()).toBe(2);
    expect(heard).toEqual([2]);
  });

  it("stops telling a listener that left", async () => {
    const { settings } = fakeSettings();
    const decay = savedNumber(settings, "my-module", "decay", RANGE, "player");
    const heard: number[] = [];
    decay.subscribe((value) => heard.push(value))();

    await decay.set(2);

    expect(heard).toEqual([]);
  });

  it.each([
    ["too high", 9, 3],
    ["too low", -1, 0.5],
    ["not a number", "2", 1.5],
    ["NaN", Number.NaN, 1.5],
  ])("keeps within range when what is saved is %s", (_, saved, read) => {
    const { settings } = fakeSettings(saved);

    expect(
      savedNumber(settings, "my-module", "decay", RANGE, "player").get(),
    ).toBe(read);
  });

  it("refuses to save what is out of range, keeping within it", async () => {
    const { settings } = fakeSettings();
    const decay = savedNumber(settings, "my-module", "decay", RANGE, "player");

    await decay.set(9);

    expect(decay.get()).toBe(3);
  });
});
