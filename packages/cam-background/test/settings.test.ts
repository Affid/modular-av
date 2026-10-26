import { describe, expect, it } from "vitest";
import {
  PRESET_IMAGES,
  imageUrl,
  MODULE_ID,
  registerSettings,
} from "../src/settings.ts";
import { fakeSettings } from "./fakes.ts";

describe("the camera background's settings", () => {
  it("are this device's: quality, strength, the image and the player's own", () => {
    const settings = fakeSettings();

    registerSettings(settings);

    expect(settings.configs()).toMatchObject({
      quality: {
        scope: "client",
        type: String,
        default: "standard",
        choices: {
          standard: `${MODULE_ID}.settings.quality.choices.standard`,
          high: `${MODULE_ID}.settings.quality.choices.high`,
        },
      },
      blurStrength: {
        scope: "client",
        type: Number,
        default: 0.5,
        range: { min: 0.1, max: 1, step: 0.05 },
      },
      image: { scope: "client", type: String, default: PRESET_IMAGES[0]?.path },
      customImage: { scope: "client", type: String, default: "" },
    });
  });

  it("read back what was saved, and fall back on anything else", () => {
    const settings = fakeSettings();
    const read = registerSettings(settings);

    settings.store("quality", "high");
    settings.store("blurStrength", 0.8);
    expect(read.quality.get()).toBe("high");
    expect(read.strength.get()).toBe(0.8);

    settings.store("quality", "ultra");
    settings.store("blurStrength", "lots");
    expect(read.quality.get()).toBe("standard");
    expect(read.strength.get()).toBe(0.5);
  });

  it("tell listeners when a setting changes", async () => {
    const settings = fakeSettings();
    const read = registerSettings(settings);
    const seen: number[] = [];
    const off = read.strength.subscribe((v) => seen.push(v));

    await settings.set(MODULE_ID, "blurStrength", 0.3);
    off();
    await settings.set(MODULE_ID, "blurStrength", 0.9);

    expect(seen).toEqual([0.3]);
  });

  it("offer our images and Foundry's own, then the player's", () => {
    const settings = fakeSettings();
    const read = registerSettings(settings);
    expect(read.images.get().map((i) => i.path)).toEqual(
      PRESET_IMAGES.map((i) => i.path),
    );

    settings.store("customImage", "worlds/table/tavern.webp");

    expect(read.images.get().at(-1)).toEqual({
      path: "worlds/table/tavern.webp",
      label: `${MODULE_ID}.images.custom`,
    });
  });
});

describe("an image's address", () => {
  const route = (path: string): string => `/prefix/${path}`;

  it("goes through Foundry's route for a path on its server", () => {
    expect(imageUrl("ui/backgrounds/setup.webp", route)).toBe(
      "/prefix/ui/backgrounds/setup.webp",
    );
    expect(imageUrl("/worlds/w/a.png", route)).toBe("/prefix/worlds/w/a.png");
  });

  it("is kept as it is for a full address", () => {
    expect(imageUrl("https://example.com/a.png", route)).toBe(
      "https://example.com/a.png",
    );
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x"])(
    "is refused for %s",
    (path) => {
      expect(imageUrl(path, route)).toBeNull();
    },
  );
});
