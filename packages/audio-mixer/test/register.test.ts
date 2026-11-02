import type {
  ButtonControl,
  Contribution,
  ControlContribution,
  SettingsSectionContribution,
} from "@modular-av/api";
import { createFakeApi } from "@modular-av/testing";
import { describe, expect, it, vi } from "vitest";
import { MODULE_ID } from "../src/constants.ts";
import { registerMixer } from "../src/register.ts";

const find = <T extends Contribution>(
  list: readonly Contribution[],
  kind: T["kind"],
): T => {
  const found = list.find((c) => c.kind === kind);
  if (!found) throw new Error(`no ${kind}`);
  return found as T;
};

describe("the ways in", () => {
  it("offers a quick control that opens the window", async () => {
    // Arrange
    const api = createFakeApi();
    const open = vi.fn();
    registerMixer(api, open);

    // Act
    const control = find<ControlContribution>(
      api.registered().contributions,
      "control",
    );
    await (control as ButtonControl).run();

    // Assert
    expect(control.place).toBe("quick");
    expect(control.effect).toBeUndefined();
    expect(open).toHaveBeenCalledOnce();
  });

  it("offers a section on the settings window's Voice tab", async () => {
    // Arrange
    const api = createFakeApi();
    const open = vi.fn();
    registerMixer(api, open);

    // Act
    const section = find<SettingsSectionContribution>(
      api.registered().contributions,
      "settings-section",
    );
    const [button] = section.controls ?? [];
    await (button as ButtonControl).run();

    // Assert
    expect(section.tab).toBe("voice");
    expect(section.id.startsWith(MODULE_ID)).toBe(true);
    expect(open).toHaveBeenCalledOnce();
  });
});
