import { describe, expect, it } from "vitest";
import { maskSecretField } from "../src/mask.ts";

describe("the app secret in Foundry's settings form", () => {
  it("shows as a password field", () => {
    const input = { type: "text" };
    const selectors: string[] = [];

    maskSecretField({
      querySelector: (selector) => {
        selectors.push(selector);
        return input;
      },
    });

    expect(selectors).toEqual(['input[name="modular-av-jitsi.appSecret"]']);
    expect(input.type).toBe("password");
  });

  it("does nothing on a form without it", () => {
    expect(() => {
      maskSecretField({ querySelector: () => null });
    }).not.toThrow();
  });
});
