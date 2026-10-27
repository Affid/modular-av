import type { TokenRequest } from "@modular-av/api";

/** What Prosody's token authentication checks (`JWT_APP_ID`, `JWT_APP_SECRET`). */
export interface JitsiCredentials {
  readonly appId: string;
  readonly appSecret: string;
}

/** A little before now, so a client clock running slightly ahead still works. */
const CLOCK_SKEW_SECONDS = 10;

/**
 * Jitsi's room names are XMPP local parts: lower case, and the token's
 * `room` claim must match the room joined. Anything else becomes "-".
 */
export const jitsiRoomName = (room: string): string =>
  room.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const encodeJson = (value: unknown): string =>
  base64Url(encoder.encode(JSON.stringify(value)));

/**
 * Signs a Jitsi token (an HS256 JWT) with WebCrypto, on the GM's browser:
 * one room, one Foundry user id, no moderator rights, no display name
 * (names shown in Foundry come from Foundry). Jitsi tokens carry no
 * publish rights: receivers enforce a GM's blocks. Never logs it.
 */
export async function signJitsiToken(
  request: TokenRequest,
  credentials: JitsiCredentials,
  now: number,
): Promise<string> {
  if (!credentials.appId || !credentials.appSecret)
    throw new Error("Jitsi needs an app id and secret to sign tokens");
  const seconds = Math.floor(now / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    iss: credentials.appId,
    aud: credentials.appId,
    sub: "*",
    room: jitsiRoomName(request.room),
    nbf: seconds - CLOCK_SKEW_SECONDS,
    exp: seconds + request.ttlSeconds,
    context: { user: { id: request.participant, moderator: "false" } },
  });
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(credentials.appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}
