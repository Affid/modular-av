// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { type FoundryForPrompt, promptGm } from "../src/legacy-dialog.ts";
import { LEGACY_SETTING } from "../src/legacy.ts";

const OLD = JSON.stringify({
  serverType: "custom",
  url: "table.livekit.cloud",
  username: "APIkey",
  password: "<b>secret</b>",
});

function foundry(answers: { wait: unknown; confirm: unknown }) {
  const saved: string[] = [];
  const deleted = vi.fn(() => Promise.resolve());
  const waits: Record<string, unknown>[] = [];
  const f: FoundryForPrompt = {
    isGM: true,
    worldSettings: {
      getItem: (key) => (key === LEGACY_SETTING ? OLD : null),
      filter: (predicate) =>
        [{ key: LEGACY_SETTING }, { key: LEGACY_SETTING }, { key: "other" }]
          .filter(predicate)
          .map(() => ({ delete: deleted })),
    },
    settings: {
      get: () => undefined,
      set: (namespace, key, value) => {
        saved.push(`${namespace}.${key}=${String(value)}`);
        return Promise.resolve(value);
      },
    },
    dialogs: {
      wait: (config) => {
        waits.push(config);
        return Promise.resolve(answers.wait);
      },
      confirm: () => Promise.resolve(answers.confirm),
    },
    notify: vi.fn(),
    localize: (key) => `<i>${key}</i>`,
  };
  return { f, saved, deleted, waits };
}

describe("the GM's prompt in Foundry", () => {
  it("offers three choices and saves under this module's keys", async () => {
    const { f, saved, deleted, waits } = foundry({
      wait: "import",
      confirm: true,
    });

    await promptGm(f);

    expect(
      (waits[0]?.buttons as { action: string }[]).map((b) => b.action),
    ).toEqual(["import", "later", "never"]);
    expect(saved).toEqual([
      "modular-av-livekit.serverUrl=wss://table.livekit.cloud",
      "modular-av-livekit.apiKey=APIkey",
      "modular-av-livekit.apiSecret=<b>secret</b>",
    ]);
    expect(deleted).toHaveBeenCalledTimes(2);
  });

  it("shows its text as text", async () => {
    const { f, waits } = foundry({ wait: null, confirm: false });

    await promptGm(f);

    expect(waits[0]?.content).toContain("&lt;i&gt;");
  });

  it("takes a closed dialog as 'not now'", async () => {
    const { f, saved } = foundry({ wait: null, confirm: false });

    await promptGm(f);

    expect(saved).toEqual([]);
  });
});
