import { describe, expect, it } from "vitest";
import { signLiveKitToken } from "../src/token.ts";

const KEY = "devkey";
const SECRET = "secret-that-is-long-enough-for-hs256";
const NOW = 1_800_000_000_000;

const fromBase64Url = (part: string): string =>
  atob(part.replace(/-/g, "+").replace(/_/g, "/"));

const decode = (part: string): unknown => JSON.parse(fromBase64Url(part));

/** An independent HMAC-SHA256 with WebCrypto, as base64url. */
async function hmac(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(data)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sign(canPublish = { audio: true, video: true }) {
  const token = await signLiveKitToken(
    { participant: "user-1", room: "world-1", canPublish, ttlSeconds: 600 },
    { apiKey: KEY, apiSecret: SECRET },
    NOW,
  );
  const [header = "", payload = "", signature = ""] = token.split(".");
  return { token, header, payload, signature };
}

describe("LiveKit join tokens", () => {
  it("is an HS256 JWT signed with the secret", async () => {
    // Act
    const { header, payload, signature } = await sign();

    // Assert
    expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" });
    const expected = await hmac(SECRET, `${header}.${payload}`);
    expect(signature).toBe(expected);
  });

  it("names the user, the room and a short life, with no admin rights", async () => {
    const { payload } = await sign();

    expect(decode(payload)).toEqual({
      iss: KEY,
      sub: "user-1",
      nbf: NOW / 1000 - 10,
      exp: NOW / 1000 + 600,
      video: {
        room: "world-1",
        roomJoin: true,
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canUpdateOwnMetadata: false,
        canPublishSources: ["microphone", "camera"],
      },
    });
  });

  it("grants publishing only for the allowed sources", async () => {
    const audioOnly = decode(
      (await sign({ audio: true, video: false })).payload,
    );
    const none = decode((await sign({ audio: false, video: false })).payload);

    expect(audioOnly).toMatchObject({
      video: { canPublish: true, canPublishSources: ["microphone"] },
    });
    expect(none).toMatchObject({
      video: { canPublish: false, canPublishSources: [] },
    });
  });

  it("refuses to sign without a key and secret", async () => {
    await expect(
      signLiveKitToken(
        {
          participant: "u",
          room: "r",
          canPublish: { audio: true, video: true },
          ttlSeconds: 60,
        },
        { apiKey: "", apiSecret: SECRET },
        NOW,
      ),
    ).rejects.toThrow(/API key and secret/);
  });
});
