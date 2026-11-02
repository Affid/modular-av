import type {
  AudioEffectDefinition,
  AudioPlace,
  EffectState,
  LocalState,
} from "@modular-av/api";
import { localState } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import { warningsOf } from "../src/model/warnings.ts";

const effect = (
  id: string,
  defaultPlace: AudioPlace,
  extra: Partial<AudioEffectDefinition> = {},
): AudioEffectDefinition =>
  ({
    id,
    kind: "audio",
    label: id,
    defaultPlace,
    create: () => Promise.reject(new Error("unused")),
    ...extra,
  }) as AudioEffectDefinition;

const reverb = effect("reverb", "send", { tail: 3 });
const radio = effect("radio", "post-gate");
const denoise = effect("denoise", "pre-gate", {
  exclusiveGroup: "noise-suppression",
});

const running: EffectState = { status: "running", error: null };

const on = (
  places: Readonly<Record<string, AudioPlace>>,
  changes: Partial<LocalState> = {},
): LocalState =>
  localState({
    chosenEffects: Object.keys(places),
    audioEffectPlaces: places,
    effects: Object.fromEntries(Object.keys(places).map((id) => [id, running])),
    ...changes,
  });

const keys = (
  definitions: readonly AudioEffectDefinition[],
  local: LocalState,
  automationRate = true,
) => warningsOf(definitions, local, automationRate).map((w) => w.key);

describe("warnings", () => {
  it("has none for a sound setup", () => {
    expect(
      keys([denoise, reverb], on({ denoise: "pre-gate", reverb: "send" })),
    ).toEqual([]);
  });

  it("says a tail ahead of the gate holds it open", () => {
    expect(warningsOf([reverb], on({ reverb: "pre-gate" }), true)).toEqual([
      { key: "tail-before-gate", effect: "reverb" },
    ]);
  });

  it("says an insert on a send doubles the voice", () => {
    expect(warningsOf([radio], on({ radio: "send" }), true)).toEqual([
      { key: "doubled-voice", effect: "radio" },
    ]);
  });

  it("doesn't call a send's own effect doubled, tail or not", () => {
    const delay = effect("delay", "send");

    expect(keys([delay], on({ delay: "send" }))).toEqual([]);
  });

  it("says noise suppression after the gate lets the gate hear the noise", () => {
    expect(warningsOf([denoise], on({ denoise: "post-gate" }), true)).toEqual([
      { key: "noise-after-gate", effect: "denoise" },
      // Nothing else: it isn't a tail and isn't on a send.
    ]);
  });

  it("says nothing about an effect that is turned off", () => {
    const local = on(
      { reverb: "pre-gate" },
      { chosenEffects: [], effects: {} },
    );

    expect(keys([reverb], local)).toEqual([]);
  });

  it("says Channel level does nothing with no send to carry the voice", () => {
    expect(keys([reverb], localState({ audioChannelLevel: 0.5 }))).toEqual([
      "channel-without-send",
    ]);
  });

  it.each(["failed", "unsupported", "unavailable"] as const)(
    "doesn't count a send that is %s as carrying the voice",
    (status) => {
      const local = on(
        { reverb: "send" },
        {
          audioChannelLevel: 0.5,
          effects: { reverb: { status, error: null } },
        },
      );

      expect(keys([reverb], local)).toEqual(["channel-without-send"]);
    },
  );

  it("counts a chosen send while out of a call, where everything reads off", () => {
    const local = on(
      { reverb: "send" },
      {
        audioChannelLevel: 0.5,
        effects: { reverb: { status: "off", error: null } },
      },
    );

    expect(keys([reverb], local)).toEqual([]);
  });

  it("says a dry path can't reach 0 cleanly without automationRate", () => {
    const local = on({ reverb: "send" }, { audioChannelLevel: 0 });

    expect(keys([reverb], local, false)).toEqual(["channel-zero-click"]);
    expect(keys([reverb], local, true)).toEqual([]);
  });
});
