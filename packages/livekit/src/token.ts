import type { TokenRequest } from "@modular-av/api";

export interface LiveKitCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
}

/** A little before now, so a client clock running slightly ahead still works. */
const CLOCK_SKEW_SECONDS = 10;

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

/** LiveKit's video grant: join one room, publish only what Foundry allows. */
function videoGrant(request: TokenRequest): Readonly<Record<string, unknown>> {
  const sources = [
    ...(request.canPublish.audio ? ["microphone"] : []),
    ...(request.canPublish.video ? ["camera"] : []),
  ];
  return {
    room: request.room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    canPublishSources: sources,
  };
}

/**
 * Signs a LiveKit access token (an HS256 JWT) with WebCrypto, on the GM's
 * browser. Never logs the token or the secret.
 */
export async function signLiveKitToken(
  request: TokenRequest,
  credentials: LiveKitCredentials,
  now: number,
): Promise<string> {
  if (!credentials.apiKey || !credentials.apiSecret)
    throw new Error("LiveKit needs an API key and secret to sign tokens");
  const seconds = Math.floor(now / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    iss: credentials.apiKey,
    sub: request.participant,
    nbf: seconds - CLOCK_SKEW_SECONDS,
    exp: seconds + request.ttlSeconds,
    video: videoGrant(request),
  });
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(credentials.apiSecret),
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
