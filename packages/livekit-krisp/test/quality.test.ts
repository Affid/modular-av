import { describe, expect, it, vi } from "vitest";
import { createQualityControl } from "../src/quality.ts";
import { MODULE_ID, type SettingsApi } from "../src/settings.ts";

function settings(initial?: unknown) {
  let value = initial;
  const set = vi.fn((_namespace: string, _key: string, next: unknown) => {
    value = next;
    return Promise.resolve(next);
  });
  const api: Pick<SettingsApi, "get" | "set"> = { get: () => value, set };
  return { api, set };
}

describe("Krisp's quality as a control", () => {
  it("is shown with the Krisp choice, while Krisp is chosen", () => {
    const { control } = createQualityControl(settings().api);

    expect(control).toMatchObject({
      kind: "control",
      type: "choice",
      effect: "krisp",
      id: `${MODULE_ID}.quality`,
      label: `${MODULE_ID}.settings.quality.name`,
    });
    expect(control.options).toEqual([
      { value: "low", label: `${MODULE_ID}.settings.quality.choices.low` },
      {
        value: "medium",
        label: `${MODULE_ID}.settings.quality.choices.medium`,
      },
      { value: "high", label: `${MODULE_ID}.settings.quality.choices.high` },
    ]);
  });

  it("reads the saved quality, medium unless chosen", () => {
    expect(createQualityControl(settings().api).control.state.get()).toBe(
      "medium",
    );
    expect(createQualityControl(settings("high").api).control.state.get()).toBe(
      "high",
    );
  });

  it("saves a quality the player picks", async () => {
    const { api, set } = settings();
    const { control } = createQualityControl(api);

    await control.set("low");

    expect(set).toHaveBeenCalledWith(MODULE_ID, "quality", "low");
  });

  it("refuses a quality Krisp doesn't have", async () => {
    const { api, set } = settings();
    const { control } = createQualityControl(api);

    await expect(control.set("ultra")).rejects.toThrow(/ultra/);
    expect(set).not.toHaveBeenCalled();
  });

  it("tells whoever shows it when the setting changes, until they stop", () => {
    const { api } = settings("low");
    const quality = createQualityControl(api);
    const seen: string[] = [];
    const stop = quality.control.state.subscribe((q) => seen.push(q));

    quality.changed();
    stop();
    quality.changed();

    expect(seen).toEqual(["low"]);
  });
});
