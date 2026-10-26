// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { type FoundryUi, pickImage } from "../src/picker.ts";

function ui(options: { canBrowse: boolean; answer?: unknown }): FoundryUi & {
  readonly opened: unknown[];
  readonly prompts: unknown[];
} {
  const opened: unknown[] = [];
  const prompts: unknown[] = [];
  return {
    opened,
    prompts,
    canBrowseFiles: () => options.canBrowse,
    localize: (key) => `[${key}]`,
    FilePicker: class {
      constructor(config: {
        current: string;
        callback: (path: string) => void;
      }) {
        opened.push(config);
        queueMicrotask(() => {
          config.callback("worlds/w/picked.webp");
        });
      }
      render = vi.fn(() => Promise.resolve());
    },
    DialogV2: {
      prompt: (config: unknown) => {
        prompts.push(config);
        return Promise.resolve(options.answer);
      },
    },
  };
}

describe("picking an image", () => {
  it("opens Foundry's file browser for a player who may browse files", async () => {
    const foundry = ui({ canBrowse: true });

    const path = await pickImage("ui/backgrounds/setup.webp", foundry);

    expect(path).toBe("worlds/w/picked.webp");
    expect(foundry.opened).toMatchObject([
      { type: "image", current: "ui/backgrounds/setup.webp" },
    ]);
  });

  it("asks the others for an address, its value kept as text", async () => {
    const foundry = ui({ canBrowse: false, answer: "  https://x.test/a.png " });

    const path = await pickImage('"><img src=x onerror=alert(1)>', foundry);

    expect(path).toBe("https://x.test/a.png");
    const content = (foundry.prompts[0] as { content: string }).content;
    const parsed = document.createElement("template");
    parsed.innerHTML = content;
    expect(parsed.content.querySelectorAll("img")).toHaveLength(0);
    expect(parsed.content.querySelector("input")?.value).toBe(
      '"><img src=x onerror=alert(1)>',
    );
  });

  it("gives nothing when the dialog is closed or left empty", async () => {
    expect(
      await pickImage("", ui({ canBrowse: false, answer: null })),
    ).toBeNull();
    expect(
      await pickImage("", ui({ canBrowse: false, answer: "  " })),
    ).toBeNull();
  });
});
