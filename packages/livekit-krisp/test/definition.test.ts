import { describe, expect, it } from "vitest";
import { createKrispDefinition, krispSection } from "../src/definition.ts";
import {
  MODULE_ID,
  readQuality,
  registerSettings,
  type SettingsApi,
} from "../src/settings.ts";
import { fakeKrisp, fakeRoom } from "./fakes.ts";

describe("Krisp as the core sees it", () => {
  it("is a noise-suppression effect offered only on LiveKit Cloud", () => {
    const definition = createKrispDefinition({
      load: () => Promise.resolve(fakeKrisp().module),
      room: fakeRoom(),
      quality: () => "medium",
      onError: () => undefined,
    });

    expect(definition).toMatchObject({
      id: "krisp",
      kind: "audio",
      stage: "denoise",
      exclusiveGroup: "noise-suppression",
      requires: ["livekit-cloud"],
      label: "modular-av-livekit-krisp.label",
      // It may gate noise to digital silence: not a stalled model.
      silencesNoise: true,
    });
  });

  it("shows its quality setting in the UI's settings window", () => {
    expect(krispSection).toMatchObject({
      kind: "settings-section",
      settings: ["modular-av-livekit-krisp.quality"],
    });
  });
});

describe("Krisp's quality", () => {
  function settings(value?: unknown) {
    const registered = new Map<string, Readonly<Record<string, unknown>>>();
    const api: SettingsApi = {
      register: (namespace, key, config) => {
        registered.set(`${namespace}.${key}`, config);
      },
      get: () => value,
    };
    return { api, registered };
  }

  it("is a choice per device, medium unless chosen", () => {
    const { api, registered } = settings();

    registerSettings(api);

    expect(registered.get(`${MODULE_ID}.quality`)).toMatchObject({
      scope: "client",
      default: "medium",
      choices: {
        low: `${MODULE_ID}.settings.quality.choices.low`,
        medium: `${MODULE_ID}.settings.quality.choices.medium`,
        high: `${MODULE_ID}.settings.quality.choices.high`,
      },
    });
    expect(readQuality(api)).toBe("medium");
  });

  it("reads a saved choice, and ignores anything else", () => {
    expect(readQuality(settings("low").api)).toBe("low");
    expect(readQuality(settings("ultra").api)).toBe("medium");
  });
});
