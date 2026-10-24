import { createRelayChannel } from "@modular-av/testing/harness/relay";
import type { CreateDefinition } from "@modular-av/testing/harness/service";
import { createP2PService } from "../../src/service.ts";

/**
 * For the service contract harness: signalling over the harness's relay,
 * one space per test room. `turn` in the URL names a TURN server (its
 * credentials come apart, as secrets); `relay=1` relays everything.
 */
export const createDefinition: CreateDefinition = (params, secrets) => {
  const room = params.get("room") ?? "room";
  const url = params.get("turn");
  const turn = url
    ? {
        type: "custom",
        url,
        username: secrets.turnUser ?? "",
        password: secrets.turnPassword ?? "",
      }
    : null;
  const settings = {
    maxParticipants: () => 6,
    stunServers: () => [],
    relayOnly: () => params.get("relay") === "1",
  };
  return {
    id: "p2p",
    label: "P2P",
    mediaOwnership: "core",
    needsToken: () => false,
    create: (context) =>
      createP2PService({
        channel: createRelayChannel(context.participant, room),
        settings,
        turn: () => turn,
        onIceChange: () => () => undefined,
        onUserLeft: () => () => undefined,
        onReconnect: () => () => undefined,
        isUser: () => true,
        isGM: () => false,
        now: () => Date.now(),
        randomId: () => crypto.randomUUID().replaceAll("-", ""),
        onError: (error) => {
          // eslint-disable-next-line no-console -- surfaces in Playwright's page log
          console.error(error instanceof Error ? error.message : "error");
        },
      }).create(context),
  };
};
