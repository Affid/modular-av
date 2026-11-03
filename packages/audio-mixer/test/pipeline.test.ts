import type { AudioEffectDefinition, AudioPlace } from "@modular-av/api";
import { localState } from "@modular-av/testing";
import { describe, expect, it } from "vitest";
import {
  lanesOf,
  moveChange,
  placeChange,
  reorder,
} from "../src/model/pipeline.ts";

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

const denoise = effect("denoise", "pre-gate", {
  exclusiveGroup: "noise-suppression",
});
const eq = effect("eq", "pre-gate");
const reverb = effect("reverb", "send");
const echo = effect("echo", "send");

const placed = (
  order: Partial<Record<AudioPlace, readonly string[]>> = {},
  places: Readonly<Record<string, AudioPlace>> = {
    denoise: "pre-gate",
    eq: "pre-gate",
    reverb: "send",
    echo: "send",
  },
) =>
  localState({
    audioEffectPlaces: places,
    audioEffectOrder: { "pre-gate": [], "post-gate": [], send: [], ...order },
  });

const idsOf = (lanes: ReturnType<typeof lanesOf>, place: AudioPlace) =>
  lanes.find((l) => l.place === place)?.effects.map((d) => d.id);

describe("lanes", () => {
  it("shows the three places in the order they run, as the core runs them", () => {
    // Act
    const lanes = lanesOf([eq, denoise, reverb, echo], placed());

    // Assert
    expect(lanes.map((l) => l.place)).toEqual([
      "pre-gate",
      "post-gate",
      "send",
    ]);
    expect(idsOf(lanes, "pre-gate")).toEqual(["denoise", "eq"]);
    expect(idsOf(lanes, "post-gate")).toEqual([]);
  });

  it("lets a player's order put something ahead of noise suppression", () => {
    const lanes = lanesOf(
      [denoise, eq],
      placed({ "pre-gate": ["eq", "denoise"] }),
    );

    expect(idsOf(lanes, "pre-gate")).toEqual(["eq", "denoise"]);
  });

  it("keeps noise suppression first when the order doesn't list it", () => {
    const lanes = lanesOf([eq, denoise], placed({ "pre-gate": ["eq"] }));

    expect(idsOf(lanes, "pre-gate")).toEqual(["denoise", "eq"]);
  });

  it("puts what the order doesn't list behind what it does", () => {
    const lanes = lanesOf([reverb, echo], placed({ send: ["echo"] }));

    expect(idsOf(lanes, "send")).toEqual(["echo", "reverb"]);
  });

  it("follows the player's place, not the effect's default", () => {
    const lanes = lanesOf([reverb], placed({}, { reverb: "post-gate" }));

    expect(idsOf(lanes, "post-gate")).toEqual(["reverb"]);
    expect(idsOf(lanes, "send")).toEqual([]);
  });

  it("ignores video effects", () => {
    const blur = { ...eq, id: "blur", kind: "video" } as never;

    const lanes = lanesOf([blur, eq], placed());

    expect(idsOf(lanes, "pre-gate")).toEqual(["eq"]);
  });
});

describe("moving within a place", () => {
  it.each([
    ["up", -1, ["b", "a", "c"]],
    ["down", 1, ["a", "c", "b"]],
  ] as const)("swaps with its neighbour going %s", (_, by, expected) => {
    expect(reorder(["a", "b", "c"], "b", by)).toEqual(expected);
  });

  it.each([
    ["first", "a", -1],
    ["last", "c", 1],
  ] as const)("refuses to move the %s past the end", (_, id, by) => {
    expect(reorder(["a", "b", "c"], id, by)).toBeNull();
  });

  it("is null for an effect that isn't there", () => {
    expect(reorder(["a"], "b", 1)).toBeNull();
  });

  it("gives the whole lane, so noise suppression stays where it was shown", () => {
    const lanes = lanesOf([denoise, eq], placed());

    expect(moveChange(lanes, "eq", -1)).toEqual({
      order: { "pre-gate": ["eq", "denoise"] },
    });
  });

  it("changes nothing at the end of a lane", () => {
    const lanes = lanesOf([denoise, eq], placed());

    expect(moveChange(lanes, "eq", 1)).toBeNull();
  });
});

describe("moving to another place", () => {
  it("lands behind what is there, and leaves the old lane in order", () => {
    // Arrange
    const lanes = lanesOf([denoise, eq, reverb], placed());

    // Act
    const change = placeChange(lanes, "reverb", "pre-gate");

    // Assert
    expect(change).toEqual({
      places: { reverb: "pre-gate" },
      order: { "pre-gate": ["denoise", "eq", "reverb"], send: [] },
    });
  });

  it("changes nothing for the place it is already at", () => {
    const lanes = lanesOf([reverb], placed());

    expect(placeChange(lanes, "reverb", "send")).toBeNull();
  });
});
