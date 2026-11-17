import { describe, expect, it } from "vitest";
import { createFakeDialogs } from "../src/foundry/dialog.ts";

describe("the fake DialogV2", () => {
  it("resolves confirm to true, false, or null when dismissed", async () => {
    // Arrange
    const fake = createFakeDialogs();
    const yes = fake.DialogV2.confirm({ content: "<p>Allow?</p>" });
    const no = fake.DialogV2.confirm();
    const closed = fake.DialogV2.confirm();

    // Act
    fake.dialogs[0]?.press("yes");
    fake.dialogs[1]?.press("no");
    fake.dialogs[2]?.dismiss();

    // Assert
    await expect(Promise.all([yes, no, closed])).resolves.toEqual([
      true,
      false,
      null,
    ]);
    expect(fake.dialogs[0]?.content).toBe("<p>Allow?</p>");
    expect(fake.dialogs.every((d) => !d.open)).toBe(true);
  });

  it("resolves wait to the pressed button's action", async () => {
    const fake = createFakeDialogs();
    const chosen = fake.DialogV2.wait({
      window: { title: "Voices" },
      buttons: [{ action: "allow" }, { action: "refuse" }],
    });

    fake.dialogs[0]?.press("refuse");

    await expect(chosen).resolves.toBe("refuse");
    expect(fake.dialogs[0]).toMatchObject({
      title: "Voices",
      actions: ["allow", "refuse"],
    });
  });

  it("refuses a button it doesn't have, and a second answer", () => {
    const fake = createFakeDialogs();
    void fake.DialogV2.confirm();
    const [dialog] = fake.dialogs;

    expect(() => dialog?.press("maybe")).toThrow(/maybe/);
    dialog?.press("yes");
    expect(() => dialog?.dismiss()).toThrow(/already/);
  });
});
