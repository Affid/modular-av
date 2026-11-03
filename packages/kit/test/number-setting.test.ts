import { describe, expect, it } from "vitest";
import { clientNumber, type SettingsApi } from "../src/number-setting.ts";

const RANGE = { min: 0.5, max: 3, value: 1.5 };

function fakeSettings(saved?: unknown) {
  let onChange: (value: unknown) => void = () => undefined;
  let value = saved;
  const scopes: unknown[] = [];
  const settings: SettingsApi = {
    register(_module, _key, config) {
      scopes.push(config.scope);
      if (saved === undefined) value = config.default;
      onChange = config.onChange as (value: unknown) => void;
    },
    get: () => value,
    set(_module, _key, next) {
      value = next;
      onChange(next);
      return Promise.resolve(next);
    },
  };
  return { settings, scopes };
}

describe("a number saved on this device", () => {
  it("starts at its default, in a client setting", () => {
    const { settings, scopes } = fakeSettings();

    const decay = clientNumber(settings, "my-module", "decay", RANGE);

    expect(decay.get()).toBe(1.5);
    expect(scopes).toEqual(["client"]);
  });

  it("saves a change and tells who listens", async () => {
    // Arrange
    const { settings } = fakeSettings();
    const decay = clientNumber(settings, "my-module", "decay", RANGE);
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
    const decay = clientNumber(settings, "my-module", "decay", RANGE);
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

    expect(clientNumber(settings, "my-module", "decay", RANGE).get()).toBe(
      read,
    );
  });

  it("refuses to save what is out of range, keeping within it", async () => {
    const { settings } = fakeSettings();
    const decay = clientNumber(settings, "my-module", "decay", RANGE);

    await decay.set(9);

    expect(decay.get()).toBe(3);
  });
});
