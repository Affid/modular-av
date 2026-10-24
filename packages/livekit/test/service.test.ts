import { afterEach, describe, expect, it, vi } from "vitest";
import { maskSecretField } from "../src/mask.ts";
import { createLiveKitService } from "../src/service.ts";
import {
  MODULE_ID,
  readSettings,
  registerSecretSettings,
  registerWorldSettings,
  type SettingsApi,
} from "../src/settings.ts";

function fakeSettings(values: Record<string, unknown> = {}) {
  const registered: Record<string, Readonly<Record<string, unknown>>> = {};
  const api: SettingsApi = {
    register: (namespace, key, config) => {
      registered[`${namespace}.${key}`] = config;
    },
    get: (namespace, key) => values[`${namespace}.${key}`],
  };
  return { api, registered };
}

const REQUEST = {
  participant: "p1",
  room: "world",
  canPublish: { audio: true, video: false },
  ttlSeconds: 60,
} as const;

describe("LiveKit settings", () => {
  it("keeps the URL in the world and the key and secret on the device", () => {
    // Arrange
    const { api, registered } = fakeSettings();

    // Act
    registerWorldSettings(api);
    registerSecretSettings(api, false);

    // Assert
    expect(registered[`${MODULE_ID}.serverUrl`]).toMatchObject({
      scope: "world",
      config: true,
    });
    for (const key of ["apiKey", "apiSecret"])
      expect(registered[`${MODULE_ID}.${key}`]).toMatchObject({
        scope: "client",
        config: false,
      });
  });

  it("shows the key and secret fields to GMs", () => {
    const { api, registered } = fakeSettings();

    registerSecretSettings(api, true);

    expect(registered[`${MODULE_ID}.apiSecret`]).toMatchObject({
      config: true,
    });
  });

  it("accepts only ws:// and wss:// server URLs", () => {
    const url = (value: unknown): string | null =>
      readSettings(
        fakeSettings({ [`${MODULE_ID}.serverUrl`]: value }).api,
      ).serverUrl();

    expect(url(" wss://example.livekit.cloud ")).toBe(
      "wss://example.livekit.cloud",
    );
    expect(url("ws://localhost:7880")).toBe("ws://localhost:7880");
    expect(url("https://example.com")).toBeNull();
    expect(url("javascript:alert(1)")).toBeNull();
    expect(url(undefined)).toBeNull();
  });

  it("allows unencrypted ws:// only on this machine or a private network", () => {
    const url = (value: string): string | null =>
      readSettings(
        fakeSettings({ [`${MODULE_ID}.serverUrl`]: value }).api,
      ).serverUrl();

    for (const local of [
      "ws://127.0.0.1:7880",
      "ws://[::1]:7880",
      "ws://192.168.1.20:7880",
      "ws://10.0.0.5",
      "ws://172.16.3.4:7880",
      "ws://livekit.local:7880",
    ])
      expect(url(local)).toBe(local);
    expect(url("ws://example.com:7880")).toBeNull();
    expect(url("ws://172.32.0.1")).toBeNull();
    expect(url("wss://user:pass@example.com")).toBeNull();
  });
});

describe("LiveKit service definition", () => {
  it("signs only with both key and secret on this device", async () => {
    // Arrange
    const withSecret = createLiveKitService({
      settings: readSettings(
        fakeSettings({
          [`${MODULE_ID}.apiKey`]: "devkey",
          [`${MODULE_ID}.apiSecret`]: "secret",
        }).api,
      ),
      now: () => 1_800_000_000_000,
      onError: () => undefined,
    });
    const without = createLiveKitService({
      settings: readSettings(
        fakeSettings({ [`${MODULE_ID}.apiKey`]: "devkey" }).api,
      ),
      now: () => 0,
      onError: () => undefined,
    });

    // Act / Assert
    expect(withSecret.canSignTokens?.()).toBe(true);
    await expect(withSecret.signToken?.(REQUEST)).resolves.toMatch(
      /^[\w-]+\.[\w-]+\.[\w-]+$/,
    );
    expect(without.canSignTokens?.()).toBe(false);
    await expect(without.signToken?.(REQUEST)).rejects.toThrow(
      /No LiveKit key and secret/,
    );
  });

  it("ends the session plainly without a server URL", async () => {
    const service = createLiveKitService({
      settings: readSettings(fakeSettings().api),
      now: () => 0,
      onError: () => undefined,
    });

    await expect(service.create({ participant: "p1" })).rejects.toMatchObject({
      serviceError: { code: "unsupported", final: true },
    });
    expect(service).toMatchObject({
      id: "livekit",
      label: "modular-av-livekit.label",
      mediaOwnership: "core",
    });
    expect(service.needsToken()).toBe(true);
  });
});

describe("the settings form", () => {
  it("shows the API secret as a password field", () => {
    const input = { type: "text" };
    const root = {
      querySelector: (selector: string) =>
        selector === `input[name="${MODULE_ID}.apiSecret"]` ? input : null,
    };

    maskSecretField(root);
    maskSecretField({ querySelector: () => null });

    expect(input.type).toBe("password");
  });
});

describe("signing outside a secure context", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says it can't sign where WebCrypto is missing (plain http on a LAN)", async () => {
    // Arrange
    vi.stubGlobal("crypto", {});
    const service = createLiveKitService({
      settings: readSettings(
        fakeSettings({
          [`${MODULE_ID}.apiKey`]: "devkey",
          [`${MODULE_ID}.apiSecret`]: "secret",
        }).api,
      ),
      now: () => 0,
      onError: () => undefined,
    });

    // Act / Assert
    expect(service.canSignTokens?.()).toBe(false);
    await expect(service.signToken?.(REQUEST)).rejects.toThrow(
      /secure context/,
    );
  });
});
