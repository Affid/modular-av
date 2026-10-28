import { createFakeApi } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import { registerBackground } from "../src/register.ts";
import { MODULE_ID, registerSettings } from "../src/settings.ts";
import { fakeSettings } from "./fakes.ts";

describe("registering the camera background", () => {
  it("adds blur and replace and their controls, loading nothing heavy", () => {
    const api = createFakeApi();

    registerBackground(api, {
      settings: registerSettings(fakeSettings()),
      route: (path) => `/${path}`,
      ui: () => {
        throw new Error("not opened");
      },
    });

    expect(api.effects.list().map((d) => d.id)).toEqual([
      "background-blur",
      "background-replace",
    ]);
    expect(api.contributions.list().map((c) => c.id)).toEqual([
      `${MODULE_ID}.strength`,
      `${MODULE_ID}.image`,
      `${MODULE_ID}.pick`,
      `${MODULE_ID}.section`,
    ]);
  });
});
