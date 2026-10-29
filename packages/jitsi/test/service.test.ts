import type { TokenRequest } from "@modular-av/api";
import { describe, expect, it, vi } from "vitest";
import { createJitsiService, type JitsiServiceDeps } from "../src/service.ts";

const REQUEST: TokenRequest = {
  participant: "user-1",
  room: "world-1",
  canPublish: { audio: true, video: true },
  ttlSeconds: 600,
};

const deps = (overrides: Partial<JitsiServiceDeps> = {}): JitsiServiceDeps => ({
  server: () => ({
    serviceUrl: "wss://x/xmpp-websocket",
    domain: "x",
    muc: "conference.x",
  }),
  credentials: () => ({ appId: "app", appSecret: "secret" }),
  sdkUrl: () => "/modules/modular-av-jitsi/vendor/lib-jitsi-meet.min.js",
  now: () => 1_800_000_000_000,
  onError: () => undefined,
  onLibraryLog: () => undefined,
  ...overrides,
});

describe("the Jitsi service definition", () => {
  it("joins with GM-relayed tokens and the core's own tracks", () => {
    const service = createJitsiService(deps());

    expect(service).toMatchObject({ id: "jitsi" });
    expect(service.needsToken()).toBe(true);
    expect(service.canSignTokens?.()).toBe(true);
  });

  it("signs tokens only where the app id and secret are", async () => {
    const service = createJitsiService(deps({ credentials: () => null }));

    expect(service.canSignTokens?.()).toBe(false);
    await expect(service.signToken?.(REQUEST)).rejects.toThrow(
      /app id and secret/,
    );
  });

  it("signs a token on the GM's browser", async () => {
    const token = await createJitsiService(deps()).signToken?.(REQUEST);

    expect(token?.split(".")).toHaveLength(3);
  });

  it("refuses to sign outside a secure context, where WebCrypto is missing", async () => {
    vi.stubGlobal("crypto", {});
    const service = createJitsiService(deps());

    expect(service.canSignTokens?.()).toBe(false);
    await expect(service.signToken?.(REQUEST)).rejects.toThrow(
      /secure context/,
    );
    vi.unstubAllGlobals();
  });

  it("can't create a connection before the server is set, for good", async () => {
    const service = createJitsiService(deps({ server: () => null }));

    await expect(service.create({ participant: "u" })).rejects.toMatchObject({
      serviceError: { code: "unsupported", final: true },
    });
  });
});
