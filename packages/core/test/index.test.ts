import type { ModularAV } from "@modular-av/api";
import { createFakeWorld, type FakeClient } from "@modular-av/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

const USERS = [{ id: "p1", name: "Player1", role: 1 }];
let uninstall: (() => void) | undefined;

async function startCore(
  modules = [{ id: "modular-av", version: "1.2.3" }],
): Promise<FakeClient> {
  const client = createFakeWorld({ users: USERS, modules }).connect("p1");
  uninstall = client.install();
  vi.resetModules();
  await import("../src/index.ts");
  // Only `init`: the rest needs a browser (see core.test.ts for the lifecycle).
  client.Hooks.callAll("init");
  return client;
}

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

describe("modular-av core entry", () => {
  it("exposes a frozen API with the module version at init", async () => {
    // Arrange / Act
    const client = await startCore();

    // Assert
    const api = client.game.modules.get("modular-av")?.api as ModularAV;
    expect(api.version).toBe("1.2.3");
    expect(Object.isFrozen(api)).toBe(true);
    expect(client.CONFIG.WebRTC.clientClass.name).toBe("ModularAVClient");
    expect(client.CONFIG.ui.webrtc.name).toBe("ModularAVCameraViews");
    expect(client.Hooks.errors).toEqual([]);
  });

  it("fails loudly when Foundry does not know the module", async () => {
    const client = await startCore([]);

    expect(client.Hooks.errors.map((e) => String(e.error))).toEqual([
      'Error: Module "modular-av" is not installed',
    ]);
  });
});
