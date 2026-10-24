import { serviceContract } from "@modular-av/testing/contract";
import { COTURN, coturnOutage } from "../../../../scripts/services/coturn.ts";

// Everything through coturn: pausing it cuts every link, which is the
// outage a mesh has (signalling goes over Foundry, as before).
serviceContract({
  service: "p2p",
  params: { turn: COTURN.url, relay: "1" },
  secrets: { turnUser: COTURN.username, turnPassword: COTURN.password },
  auth: "none",
  outage: coturnOutage,
});
