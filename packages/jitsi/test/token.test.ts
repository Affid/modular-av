import { describe, expect, it } from "vitest";
import { jitsiRoomName, signJitsiToken } from "../src/token.ts";

const APP_ID = "modular-av-test";
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

async function sign(room = "world-1") {
  const token = await signJitsiToken(
    {
      participant: "user-1",
      room,
      canPublish: { audio: true, video: false },
      ttlSeconds: 600,
    },
    { appId: APP_ID, appSecret: SECRET },
    NOW,
  );
  const [header = "", payload = "", signature = ""] = token.split(".");
  return { header, payload, signature };
}

describe("Jitsi join tokens", () => {
  it("is an HS256 JWT signed with the app secret", async () => {
    // Act
    const { header, payload, signature } = await sign();

    // Assert
    expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(signature).toBe(await hmac(SECRET, `${header}.${payload}`));
  });

  it("names the app, the room and the user only, for a short life", async () => {
    const { payload } = await sign();

    expect(decode(payload)).toEqual({
      iss: APP_ID,
      aud: APP_ID,
      sub: "*",
      room: "world-1",
      nbf: NOW / 1000 - 10,
      exp: NOW / 1000 + 600,
      context: { user: { id: "user-1", moderator: "false" } },
    });
  });

  it("names the room as Jitsi does: lower case, nothing XMPP refuses", async () => {
    const { payload } = await sign("My World@Home");

    expect(decode(payload)).toMatchObject({ room: "my-world-home" });
    expect(jitsiRoomName("abc_1-x")).toBe("abc_1-x");
  });

  it("refuses to sign without an app id and secret", async () => {
    await expect(
      signJitsiToken(
        {
          participant: "u",
          room: "r",
          canPublish: { audio: true, video: true },
          ttlSeconds: 60,
        },
        { appId: APP_ID, appSecret: "" },
        NOW,
      ),
    ).rejects.toThrow(/app id and secret/);
  });
});
