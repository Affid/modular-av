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

/** Why the settings name no deployment: a line for the log, for a GM. */
type Problem = string;

const PROBLEMS = {
  noServer: "Set the Jitsi server in the module settings",
  badServer:
    "The Jitsi server address in the module settings can't be used: give the site's https:// address, such as https://meet.example.com, with nothing after ? or # (plain http:// only on this computer or a private network)",
  noLink:
    "Set the Jitsi room link in the module settings, such as https://meet.example.com/OurTable",
  badLink:
    "The Jitsi room link in the module settings can't be used: give an https:// link, such as https://meet.example.com/OurTable (plain http:// only on this computer or a private network)",
  badRoom:
    "The room in the Jitsi room link can only have letters, digits, - and _",
  noRoom:
    "The Jitsi room link names no room yet: a GM's browser adds one when it saves, or give one, such as https://meet.example.com/OurTable",
  badDomains:
    "Check the XMPP and conference domains in the module settings: letters, digits, dots and dashes only",
} as const;

function tokenServer(settings: ServerSettings): JitsiServer | Problem {
  if (!settings.serverUrl) return PROBLEMS.noServer;
  const socket = webSocketOf(settings.serverUrl);
  if (!socket) return PROBLEMS.badServer;
  const hosts = hostsOf(settings, socket);
  return hosts ? { serviceUrl: socket.href, ...hosts } : PROBLEMS.badDomains;
}

/**
 * An open server: the link's room, which also pins the WebSocket to the
 * room's shard (as Jitsi's page does). With no domains given, Docker's
 * names are tried after the link's host.
 */
function openServer(settings: ServerSettings): JitsiServer | Problem {
  if (!settings.serverUrl) return PROBLEMS.noLink;
  const link = parseOpenAddress(settings.serverUrl);
  if (!link.ok)
    return link.problem === "room" ? PROBLEMS.badRoom : PROBLEMS.badLink;
  if (link.room === null) return PROBLEMS.noRoom;
  const hosts = hostsOf(settings, link.socket);
  if (!hosts) return PROBLEMS.badDomains;
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

const read = (settings: ServerSettings): JitsiServer | Problem =>
  settings.access === "open" ? openServer(settings) : tokenServer(settings);

/** The deployment the settings name, or null when they name none usable. */
export function serverOf(settings: ServerSettings): JitsiServer | null {
  const server = read(settings);
  return typeof server === "string" ? null : server;
}

/** Why the settings name no usable deployment, or null when they name one. */
export function serverProblemOf(settings: ServerSettings): string | null {
  const server = read(settings);
  return typeof server === "string" ? server : null;
}
