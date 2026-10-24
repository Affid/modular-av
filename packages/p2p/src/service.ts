import type {
  Channel,
  ParticipantId,
  ServiceDefinition,
} from "@modular-av/api";
import { P2PServiceError } from "./failure.ts";
import { type FoundryTurn, iceConfiguration } from "./ice.ts";
import type { CreatePeerConnection } from "./peer.ts";
import { MODULE_ID, type P2PSettings } from "./settings.ts";

export interface P2PServiceDeps {
  /** The core's socket channel for signalling. */
  readonly channel: Channel;
  readonly settings: P2PSettings;
  /** Foundry's `world.turn` A/V setting. */
  readonly turn: () => FoundryTurn | null;
  readonly onIceChange: (listener: () => void) => () => void;
  readonly onUserLeft: (listener: (user: ParticipantId) => void) => () => void;
  /** Foundry's socket connected again: what it sent meanwhile is lost. */
  readonly onReconnect: (listener: () => void) => () => void;
  readonly isUser: (user: ParticipantId) => boolean;
  readonly isGM: (user: ParticipantId) => boolean;
  /** The browser's `RTCPeerConnection` unless given. */
  readonly createPeerConnection?: CreatePeerConnection;
  readonly now: () => number;
  readonly randomId: () => string;
  readonly onError: (error: unknown) => void;
}

const browserPeerConnection = (): CreatePeerConnection | null =>
  typeof RTCPeerConnection === "function"
    ? (configuration) => new RTCPeerConnection(configuration)
    : null;

/**
 * What the module registers with the core: small on purpose, the
 * connection code loads when someone joins. No token: Foundry's server
 * already names every sender, and the rights are Foundry's permissions.
 */
export function createP2PService(deps: P2PServiceDeps): ServiceDefinition {
  // A reconnect keeps this page's place in the call.
  let firstJoin: number | null = null;
  return {
    id: "p2p",
    label: `${MODULE_ID}.label`,
    mediaOwnership: "core",
    needsToken: () => false,
    async create(context) {
      const createPeerConnection =
        deps.createPeerConnection ?? browserPeerConnection();
      if (!createPeerConnection)
        throw new P2PServiceError({
          code: "unsupported",
          final: true,
          message: "This browser has no WebRTC",
        });
      const { createP2PConnection } = await import("./connection.ts");
      const joinedAt = (firstJoin ??= deps.now());
      return createP2PConnection(context, {
        ...deps,
        createPeerConnection,
        iceConfiguration: () => iceConfiguration(deps.turn(), deps.settings),
        maxParticipants: () => deps.settings.maxParticipants(),
        joinedAt: () => joinedAt,
      });
    },
  };
}
