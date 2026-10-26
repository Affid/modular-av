import type {
  AVState,
  ButtonControl,
  ChoiceControl,
  Contribution,
  Control,
  ControlContribution,
  EffectState,
  RangeControl,
  SettingsSectionContribution,
  ToggleControl,
} from "@modular-av/api";
import { avState } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import { backgroundContributions } from "../src/controls.ts";
import { MODULE_ID, PRESET_IMAGES, registerSettings } from "../src/settings.ts";
import { fakeSettings } from "./fakes.ts";

const off: EffectState = { status: "off", error: null };

function setup(
  effects: Readonly<Record<string, EffectState>> = {
    "background-blur": off,
    "background-replace": off,
  },
  picked: string | null = "worlds/w/tavern.png",
) {
  let state: AVState = avState({ local: { effects } });
  const listeners: (() => void)[] = [];
  const calls: [string, boolean][] = [];
  const settings = fakeSettings();
  const observed = registerSettings(settings);
  const contributions = backgroundContributions({
    api: {
      state: {
        get: () => state,
        subscribe(selector, listener) {
          let previous = selector(state);
          const call = (): void => {
            const next = selector(state);
            if (Object.is(next, previous)) return;
            const before = previous;
            previous = next;
            listener(next, before);
          };
          listeners.push(call);
          return () => undefined;
        },
      },
      commands: {
        setEffectEnabled(id, on) {
          calls.push([id, on]);
          return Promise.resolve();
        },
      },
    },
    settings: observed,
    route: (path) => `/${path}`,
    pickImage: () => Promise.resolve(picked),
  });
  const setEffects = (next: Readonly<Record<string, EffectState>>): void => {
    state = { ...state, local: { ...state.local, effects: next } };
    for (const l of listeners) l();
  };
  const find = (id: string): Contribution => {
    const found = contributions.find((c) => c.id === id);
    if (!found) throw new Error(`no ${id}`);
    return found;
  };
  const toggle = (id: string): ToggleControl =>
    find(id) as ControlContribution & ToggleControl;
  const section = (id: string): SettingsSectionContribution =>
    find(id) as SettingsSectionContribution;
  return { contributions, settings, calls, setEffects, toggle, section };
}

const nested = (toggle: ToggleControl, type: Control["type"]): Control => {
  const found = toggle.controls?.find((c) => c.type === type);
  if (!found) throw new Error(`no ${type}`);
  return found;
};

describe("the camera background's controls", () => {
  it("are two quick toggles and a settings section", () => {
    const { contributions } = setup();

    expect(
      contributions.map((c) => [
        c.id,
        c.kind,
        c.kind === "control" ? c.place : null,
      ]),
    ).toEqual([
      [`${MODULE_ID}.blur`, "control", "quick"],
      [`${MODULE_ID}.replace`, "control", "quick"],
      [`${MODULE_ID}.section`, "settings-section", null],
    ]);
  });

  it("turn their effect on and off, and show it starting", () => {
    // Arrange
    const { toggle, calls, setEffects } = setup();
    const blur = toggle(`${MODULE_ID}.blur`);
    const seen: unknown[] = [];
    blur.state.subscribe((s) => seen.push(s));

    // Act
    void blur.set(true);
    setEffects({
      "background-blur": { status: "starting", error: null },
      "background-replace": off,
    });
    setEffects({
      "background-blur": { status: "running", error: null },
      "background-replace": off,
    });

    // Assert
    expect(calls).toEqual([["background-blur", true]]);
    expect(seen).toEqual([
      { on: true, busy: true, disabled: false },
      { on: true, busy: false, disabled: false },
    ]);
  });

  it("can't be turned on where the browser can't run them", () => {
    const { toggle } = setup({
      "background-blur": { status: "unsupported", error: null },
      "background-replace": off,
    });

    expect(toggle(`${MODULE_ID}.blur`).state.get()).toEqual({
      on: false,
      busy: false,
      disabled: true,
    });
  });

  it("set the blur's strength in percent", async () => {
    const { toggle, settings } = setup();
    const strength = (
      nested as (t: ToggleControl, k: Control["type"]) => RangeControl
    )(toggle(`${MODULE_ID}.blur`), "range");

    await strength.set(80);

    expect(strength).toMatchObject({ min: 10, max: 100, step: 5, unit: "%" });
    expect(settings.get(MODULE_ID, "blurStrength")).toBe(0.8);
    expect(strength.state.get()).toBe(80);
  });

  it("offer the images as pictures, and the player's own once picked", async () => {
    // Arrange
    const { toggle, settings } = setup();
    const replace = toggle(`${MODULE_ID}.replace`);
    const images = (
      nested as (t: ToggleControl, k: Control["type"]) => ChoiceControl
    )(replace, "choice");
    const pick = (
      nested as (t: ToggleControl, k: Control["type"]) => ButtonControl
    )(replace, "button");
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
    const { toggle, settings } = setup(undefined, null);
    const pick = (
      nested as (t: ToggleControl, k: Control["type"]) => ButtonControl
    )(toggle(`${MODULE_ID}.replace`), "button");

    await pick.run();

    expect(settings.get(MODULE_ID, "image")).toBe(PRESET_IMAGES[0]?.path);
  });

  it("refuse an address that isn't an image's", async () => {
    const { toggle } = setup(undefined, "javascript:alert(1)");
    const pick = (
      nested as (t: ToggleControl, k: Control["type"]) => ButtonControl
    )(toggle(`${MODULE_ID}.replace`), "button");

    await expect(pick.run()).rejects.toMatchObject({ name: "ImageLoadError" });
  });

  it("put the quality, strength and image in the settings window", () => {
    const { section } = setup();

    const found = section(`${MODULE_ID}.section`);

    expect(found.settings).toEqual([`${MODULE_ID}.quality`]);
    expect(found.controls?.map((c) => c.type)).toEqual([
      "range",
      "choice",
      "button",
    ]);
  });
});
