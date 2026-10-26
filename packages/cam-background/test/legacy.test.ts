import { describe, expect, it } from "vitest";
import { importLegacy, legacyBackground } from "../src/legacy.ts";
import { MODULE_ID, registerSettings } from "../src/settings.ts";
import { fakeSettings } from "./fakes.ts";

/** Foundry keeps client settings in localStorage as JSON. */
const old = (values: Record<string, unknown>) => ({
  getItem: (key: string) => {
    const name = key.replace(/^avclient-livekit\./, "");
    return key.startsWith("avclient-livekit.") && name in values
      ? JSON.stringify(values[name])
      : null;
  },
});

describe("the camera background a player had in LiveKit AVClient", () => {
  it("is blur or replace, with its strength, quality and images", () => {
    expect(
      legacyBackground(
        old({
          videoBackground: "image",
          videoBlurStrength: 0.8,
          videoBackgroundQuality: "high",
          videoBackgroundImage: "worlds/w/tavern.webp",
          videoBackgroundCustomImage: "worlds/w/tavern.webp",
        }),
      ),
    ).toEqual({
      effect: "background-replace",
      strength: 0.8,
      quality: "high",
      image: "worlds/w/tavern.webp",
      customImage: "worlds/w/tavern.webp",
    });
    expect(legacyBackground(old({ videoBackground: "blur" }))).toEqual({
      effect: "background-blur",
    });
  });

  it("keeps out what doesn't make sense", () => {
    expect(
      legacyBackground(
        old({
          videoBackground: "none",
          videoBlurStrength: 7,
          videoBackgroundQuality: "ultra",
          videoBackgroundImage: 3,
        }),
      ),
    ).toEqual({});
  });

  it("is brought over once: settings, then the effect turned on", async () => {
    const settings = fakeSettings();
    const observed = registerSettings(settings);
    const turned: string[] = [];

    await importLegacy({
      storage: old({ videoBackground: "blur", videoBlurStrength: 0.3 }),
      settings: observed,
      turnOn: (id) => {
        turned.push(id);
        return Promise.resolve();
      },
    });

    expect(settings.get(MODULE_ID, "blurStrength")).toBe(0.3);
    expect(settings.get(MODULE_ID, "legacyImported")).toBe(true);
    expect(turned).toEqual(["background-blur"]);
  });
});
