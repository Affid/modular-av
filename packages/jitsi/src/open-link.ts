import {
  SOCKET_PATH,
  sitePathOf,
  socketAt,
  socketScheme,
  urlOf,
} from "./address.ts";

/** An open server's address or room link, read; or what is wrong with it. */
export type OpenAddress =
  | { readonly ok: true; readonly socket: URL; readonly room: string | null }
  | { readonly ok: false; readonly problem: "address" | "room" };

/**
 * Room names the module and Jitsi's own web page turn into the same
 * room: Jitsi's page folds case and encodes anything else differently.
 */
const ROOM = /^[a-z0-9_-]{1,128}$/i;

/** Parameters that carry a sign-in token in a Jitsi link, in any case. */
const TOKEN_KEY = /^(jwt|token|access_token)$/i;

const hasToken = (params: URLSearchParams): boolean =>
  [...params.keys()].some((key) => TOKEN_KEY.test(key));

/** Jitsi's page reads settings, and could read a token, from the hash too. */
const hashParams = (url: URL): URLSearchParams =>
  new URLSearchParams(url.hash.slice(1));

interface SitePath {
  /** The site's own path, e.g. "/jitsi", or "" at the host's root. */
  readonly base: string;
  readonly room: string | undefined;
}

/** The last path segment names the room, unless it is the WebSocket. */
function openPathOf(url: URL): SitePath {
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  const last = segments.at(-1);
  const site = last === undefined ? segments : segments.slice(0, -1);
  return {
    base: site.map((s) => `/${s}`).join(""),
    room: last === SOCKET_PATH ? undefined : last,
  };
}

function roomName(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A broken percent sequence names no room.
    return null;
  }
  return ROOM.test(decoded) ? decoded.toLowerCase() : null;
}

/**
 * A server's address (https://meet.example.com) or a room link as people
 * send it to friends (https://meet.example.com/OurTable). The query and
 * the hash (Jitsi's page settings) don't matter here.
 */
export function parseOpenAddress(address: string): OpenAddress {
  const url = urlOf(address.trim());
  const scheme = url && socketScheme(url);
  if (!url || !scheme) return { ok: false, problem: "address" };
  const { base, room } = openPathOf(url);
  const socket = socketAt(scheme, url, base);
  if (room === undefined) return { ok: true, socket, room: null };
  const name = roomName(room);
  return name
    ? { ok: true, socket, room: name }
    : { ok: false, problem: "room" };
}

/** The link without token parameters; a hash holding one goes whole. */
function withoutTokens(url: URL): URL {
  const kept = new URLSearchParams(
    [...url.searchParams].filter(([key]) => !TOKEN_KEY.test(key)),
  );
  const query = kept.size > 0 ? `?${kept.toString()}` : "";
  const hash = hasToken(hashParams(url)) ? "" : url.hash;
  return new URL(`${url.origin}${url.pathname}${query}${hash}`);
}

/**
 * A room link back as its site's address, as tokens read the setting:
 * the room (the last path segment, read as an open server reads it) and
 * the page settings go. The same value when it names no room.
 */
export function siteAddressOf(value: string): string {
  const url = urlOf(value.trim());
  const read = url && parseOpenAddress(url.href);
  if (!url || !read?.ok || read.room === null) return value;
  return `${url.origin}${openPathOf(url).base}`;
}

/**
 * A site's address as tokens read it, with a room after its whole path:
 * for an open server chosen with the address tokens had. The same value
 * when it isn't an address.
 */
export function siteWithRoom(value: string, room: string): string {
  const url = urlOf(value.trim());
  return url ? `${url.origin}${sitePathOf(url)}/${room}` : value;
}

const withRoom = (url: URL, room: string): URL =>
  new URL(
    `${url.origin}${openPathOf(url).base}/${room}${url.search}${url.hash}`,
  );

/** Whether an address carries a sign-in token, in its query or hash. */
export function carriesToken(value: string): boolean {
  const url = urlOf(value.trim());
  return (
    url !== null && (hasToken(url.searchParams) || hasToken(hashParams(url)))
  );
}

/**
 * What the address setting should hold. World settings reach every
 * player, so a token pasted with a link is taken out. An open server's
 * address without a room gets a random one, kept in the setting where
 * the GM sees it. The same value when nothing is to change.
 */
export function normalizeAddress(
  value: string,
  open: boolean,
  random: () => string,
): string {
  const url = urlOf(value.trim());
  if (!url) return value;
  const removeToken = carriesToken(value);
  const safe = removeToken ? withoutTokens(url) : url;
  const read = parseOpenAddress(safe.href);
  const needsRoom = open && read.ok && read.room === null;
  if (!removeToken && !needsRoom) return value;
  return (needsRoom ? withRoom(safe, random()) : safe).href;
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
/** 100 random bits: nobody guesses the room. */
const ROOM_LENGTH = 20;

/** A room name for an open server; works outside secure contexts too. */
export function randomRoom(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_LENGTH));
  return Array.from(bytes, (b) => BASE32.charAt(b % BASE32.length)).join("");
}
