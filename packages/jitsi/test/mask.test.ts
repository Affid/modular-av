import { describe, expect, it } from "vitest";
import { followAccessChoice, maskSecretField } from "../src/mask.ts";

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

describe("the app id and secret rows in Foundry's settings form", () => {
  function fakeForm(access: string) {
    const rows = { appId: { hidden: false }, appSecret: { hidden: false } };
    let onChange: () => void = () => undefined;
    const select = {
      value: access,
      closest: () => null,
      addEventListener: (_type: "change", listener: () => void) => {
        onChange = listener;
      },
    };
    const input = (row: { hidden: boolean }) => ({
      closest: (selector: string) => (selector === ".form-group" ? row : null),
      addEventListener: () => undefined,
    });
    const root = {
      querySelector: (selector: string) => {
        if (selector === 'select[name="modular-av-jitsi.access"]')
          return select;
        if (selector === 'input[name="modular-av-jitsi.appId"]')
          return input(rows.appId);
        if (selector === 'input[name="modular-av-jitsi.appSecret"]')
          return input(rows.appSecret);
        return null;
      },
    };
    return {
      root,
      rows,
      choose(value: string) {
        select.value = value;
        onChange();
      },
    };
  }

  it("hide while an open server is chosen, and come back for tokens", () => {
    const form = fakeForm("open");

    followAccessChoice(form.root);

    expect(form.rows).toEqual({
      appId: { hidden: true },
      appSecret: { hidden: true },
    });
    form.choose("token");
    expect(form.rows).toEqual({
      appId: { hidden: false },
      appSecret: { hidden: false },
    });
  });

  it("show for tokens, and do nothing on a form without the choice", () => {
    const form = fakeForm("token");

    followAccessChoice(form.root);

    expect(form.rows.appId.hidden).toBe(false);
    expect(() => {
      followAccessChoice({ querySelector: () => null });
    }).not.toThrow();
  });
});
