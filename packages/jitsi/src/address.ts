/** Loopback, private ranges and .local names: unencrypted is acceptable there. */
const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;

const SECURE: Readonly<Record<string, string>> = {
  "https:": "wss:",
  "wss:": "wss:",
};
const PLAIN: Readonly<Record<string, string>> = {
  "http:": "ws:",
  "ws:": "ws:",
};

/** The XMPP WebSocket's path at the end of a site's path. */
export const SOCKET_PATH = "xmpp-websocket";

/** A URL, or null for anything that isn't one. */
export function urlOf(address: string): URL | null {
  try {
    return new URL(address);
  } catch {
    // Not a URL at all.
    return null;
  }
}

/**
 * The WebSocket scheme for a site's address: encrypted, or plain only on
 * this machine or a private network, since every player connects to it.
 * Null for anything else, or an address carrying a user name.
 */
export function socketScheme(url: URL): string | null {
  if (url.username || url.password) return null;
  return (
    SECURE[url.protocol] ??
    (LOCAL_HOST.test(url.hostname) ? PLAIN[url.protocol] : undefined) ??
    null
  );
}

/** The XMPP WebSocket of a site at `path` (no trailing slash). */
export const socketAt = (scheme: string, url: URL, path: string): URL =>
  new URL(`${scheme}//${url.host}${path}/${SOCKET_PATH}`);
