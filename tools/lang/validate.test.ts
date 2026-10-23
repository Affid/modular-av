import { describe, expect, it } from "vitest";
import { compareWithReference, validateLanguageData } from "./validate.ts";

const ID = "modular-av-livekit";

describe("validateLanguageData", () => {
  it("accepts nested and dotted keys under the module id", () => {
    // Arrange
    const data = {
      [ID]: { settings: { url: "Server URL" }, "status.ok": "OK" },
    };

    // Act
    const issues = validateLanguageData(data, ID);

    // Assert
    expect(issues).toEqual([]);
  });

  it("requires the module id as the only root key", () => {
    const issues = validateLanguageData({ other: { a: "A" } }, ID);

    expect(issues.map((i) => i.message)).toEqual([
      `missing root key "${ID}"`,
      `unexpected root key "other": every key must sit under "${ID}"`,
    ]);
  });

  it("rejects a file that is not a JSON object", () => {
    expect(validateLanguageData(["x"], ID)).toEqual([
      { path: "", message: "must be a JSON object" },
    ]);
  });

  it("rejects values that are neither strings nor objects", () => {
    const issues = validateLanguageData(
      { [ID]: { count: 3, list: ["a"] } },
      ID,
    );

    expect(issues).toEqual([
      {
        path: `${ID}.count`,
        message: "must be a string or an object, not number",
      },
      {
        path: `${ID}.list`,
        message: "must be a string or an object, not array",
      },
    ]);
  });

  it("finds a key that is both a string and a parent through dotted keys", () => {
    const data = { [ID]: { "a.b": "Text", a: { b: { c: "Deeper" } } } };

    const issues = validateLanguageData(data, ID);

    expect(issues).toEqual([
      {
        path: `${ID}.a.b`,
        message: `is both a string and a parent of "${ID}.a.b.c"; Foundry would drop the whole file`,
      },
    ]);
  });

  it("finds the same key defined twice through dotted and nested keys", () => {
    const data = { [ID]: { "a.b": "One", a: { b: "Two" } } };

    expect(validateLanguageData(data, ID)).toEqual([
      { path: `${ID}.a.b`, message: "is defined more than once" },
    ]);
  });

  it("rejects empty key segments", () => {
    const issues = validateLanguageData({ [ID]: { "a..b": "x", "": "y" } }, ID);

    expect(issues.map((i) => i.message)).toEqual([
      'key "a..b" has an empty segment',
      'key "" has an empty segment',
    ]);
  });
});

describe("compareWithReference", () => {
  it("lists keys the reference language does not have", () => {
    const en = { [ID]: { a: "A", b: { c: "C" } } };
    const de = { [ID]: { a: "A", "b.c": "C", d: "D" } };

    expect(compareWithReference(de, en)).toEqual([
      { path: `${ID}.d`, message: "is not in the reference language file" },
    ]);
  });
});
