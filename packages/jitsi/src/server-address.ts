import { sitePathOf, socketAt, socketScheme, urlOf } from "./address.ts";
import type { JitsiServer, XmppHosts } from "./join.ts";
import { parseOpenAddress } from "./open-link.ts";
import type { ServerSettings } from "./settings.ts";

/**
 * The XMPP WebSocket of a Jitsi site given as its address
 * (https://meet.example.com) or as the WebSocket itself; unencrypted only
 * on this machine or a private network, since every player sends their
 * token to it. Null for anything else.
 */
export function webSocketOf(address: string): URL | null {
  const url = urlOf(address);
  if (!url || url.search || url.hash) return null;
  const scheme = socketScheme(url);
  return scheme ? socketAt(scheme, url, sitePathOf(url)) : null;
}

/** A host name as XMPP uses it: letters, digits, dots and dashes. */
const DOMAIN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

/** Docker installs of Jitsi name their XMPP hosts this way. */
const DOCKER_HOSTS: XmppHosts = {
  domain: "meet.jitsi",
  muc: "muc.meet.jitsi",
};

/** The domains given, or derived from the WebSocket's host; null if unusable. */
function hostsOf(settings: ServerSettings, socket: URL): XmppHosts | null {
  const domain = settings.xmppDomain || socket.hostname;
  const muc = settings.mucDomain || `conference.${domain}`;
  return DOMAIN.test(domain) && DOMAIN.test(muc) ? { domain, muc } : null;
}

function tokenServer(settings: ServerSettings): JitsiServer | null {
  const socket = webSocketOf(settings.serverUrl);
  const hosts = socket && hostsOf(settings, socket);
  return socket && hosts ? { serviceUrl: socket.href, ...hosts } : null;
}

/**
 * An open server: the link's room, which also pins the WebSocket to the
 * room's shard (as Jitsi's page does). With no domains given, Docker's
 * names are tried after the link's host.
 */
function openServer(settings: ServerSettings): JitsiServer | null {
  const link = parseOpenAddress(settings.serverUrl);
  if (!link.ok || link.room === null) return null;
  const hosts = hostsOf(settings, link.socket);
  if (!hosts) return null;
  const guessed = !settings.xmppDomain && !settings.mucDomain;
  const fallback =
    guessed && hosts.domain !== DOCKER_HOSTS.domain ? DOCKER_HOSTS : null;
  const room = encodeURIComponent(link.room);
  return {
    serviceUrl: `${link.socket.href}?room=${room}`,
    ...hosts,
    open: fallback ? { room: link.room, fallback } : { room: link.room },
  };
}

/** The deployment the settings name, or null when they name none usable. */
export const serverOf = (settings: ServerSettings): JitsiServer | null =>
  settings.access === "open" ? openServer(settings) : tokenServer(settings);
