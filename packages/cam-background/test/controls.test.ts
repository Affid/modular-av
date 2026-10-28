import type {
  ButtonControl,
  ChoiceControl,
  Contribution,
  ControlContribution,
  RangeControl,
  SettingsSectionContribution,
} from "@modular-av/api";
import { describe, expect, it } from "vitest";
import { backgroundContributions } from "../src/controls.ts";
import { MODULE_ID, PRESET_IMAGES, registerSettings } from "../src/settings.ts";
import { fakeSettings } from "./fakes.ts";

function setup(picked: string | null = "worlds/w/tavern.png") {
  const settings = fakeSettings();
  const observed = registerSettings(settings);
  const contributions = backgroundContributions({
    settings: observed,
    route: (path) => `/${path}`,
    pickImage: () => Promise.resolve(picked),
  });
  const find = (id: string): Contribution => {
    const found = contributions.find((c) => c.id === id);
    if (!found) throw new Error(`no ${id}`);
    return found;
  };
  return { contributions, settings, find };
}

describe("the camera background's controls", () => {
  it("attach to their effects, and keep the quality for the Video tab", () => {
    const { contributions } = setup();

    expect(
      contributions.map((c) => [
        c.id,
        c.kind === "control"
          ? c.effect
          : c.kind === "settings-section"
            ? c.tab
            : null,
      ]),
    ).toEqual([
      [`${MODULE_ID}.strength`, "background-blur"],
      [`${MODULE_ID}.image`, "background-replace"],
      [`${MODULE_ID}.pick`, "background-replace"],
      [`${MODULE_ID}.section`, "video"],
    ]);
  });

  it("set the blur's strength in percent", async () => {
    const { find, settings } = setup();
    const strength = find(`${MODULE_ID}.strength`) as ControlContribution &
      RangeControl;

    await strength.set(80);

    expect(strength).toMatchObject({ min: 10, max: 100, step: 5, unit: "%" });
    expect(settings.get(MODULE_ID, "blurStrength")).toBe(0.8);
    expect(strength.state.get()).toBe(80);
  });

  it("offer the images as pictures, and the player's own once picked", async () => {
    // Arrange
    const { find, settings } = setup();
    const images = find(`${MODULE_ID}.image`) as ControlContribution &
      ChoiceControl;
    const pick = find(`${MODULE_ID}.pick`) as ControlContribution &
      ButtonControl;
    expect(images.options.map((o) => o.value)).toEqual(
      PRESET_IMAGES.map((i) => i.path),
    );
    expect(images.options[0]?.image).toBe(`/${PRESET_IMAGES[0]?.path ?? ""}`);

    // Act
    await pick.run();

    // Assert
    expect(settings.get(MODULE_ID, "image")).toBe("worlds/w/tavern.png");
    expect(images.state.get()).toBe("worlds/w/tavern.png");
    expect(images.options.at(-1)).toEqual({
      value: "worlds/w/tavern.png",
      label: `${MODULE_ID}.images.custom`,
      image: "/worlds/w/tavern.png",
    });
  });

  it("keep the image when the player picks none", async () => {
    const { find, settings } = setup(null);
    const pick = find(`${MODULE_ID}.pick`) as ControlContribution &
      ButtonControl;

    await pick.run();

    expect(settings.get(MODULE_ID, "image")).toBe(PRESET_IMAGES[0]?.path);
  });

  it("refuse an address that isn't an image's", async () => {
    const { find } = setup("javascript:alert(1)");
    const pick = find(`${MODULE_ID}.pick`) as ControlContribution &
      ButtonControl;

    await expect(pick.run()).rejects.toMatchObject({ name: "ImageLoadError" });
  });

  it("put only the quality in the settings section: the rest is with the effects", () => {
    const { find } = setup();

    const found = find(`${MODULE_ID}.section`) as SettingsSectionContribution;

    expect(found.settings).toEqual([`${MODULE_ID}.quality`]);
    expect(found.controls).toBeUndefined();
  });
});
