import type { P2PSettings } from "./settings.ts";

/** Foundry's `world.turn` A/V setting: "server" means no relay of the GM's own. */
export interface FoundryTurn {
  readonly type: string;
  readonly url: string;
  readonly username: string;
  readonly password: string;
}

const ICE_URL =
  /^(stuns?|turns?):(\[[\da-f:.]+\]|[\w.-]+)(:\d{1,5})?(\?transport=(udp|tcp))?$/i;

/** Foundry's TURN server, if the GM set a complete one. */
function turnServer(turn: FoundryTurn | null): RTCIceServer | null {
  if (turn?.type !== "custom" || !turn.username || !turn.password) return null;
  const urls = turn.url.split(/[\s,]+/).filter((url) => url.length > 0);
  if (urls.length === 0 || !urls.every((url) => ICE_URL.test(url))) return null;
  return { urls, username: turn.username, credential: turn.password };
}

/**
 * Foundry's TURN server when the GM set one (it answers STUN too), else
 * the module's STUN servers. Relaying only needs a TURN server.
 */
export function iceConfiguration(
  turn: FoundryTurn | null,
  settings: P2PSettings,
): RTCConfiguration {
  const relay = turnServer(turn);
  if (relay)
    return {
      iceServers: [relay],
      iceTransportPolicy: settings.relayOnly() ? "relay" : "all",
    };
  const stun = settings.stunServers();
  return {
    iceServers: stun.length > 0 ? [{ urls: [...stun] }] : [],
    iceTransportPolicy: "all",
  };
}
