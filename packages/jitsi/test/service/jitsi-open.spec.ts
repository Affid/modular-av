import { serviceContract } from "@modular-av/testing/contract";
import {
  JITSI_OPEN_DOCKER,
  jitsiOpenOutage,
} from "../../../../scripts/services/jitsi.ts";

// An open server: no token; Foundry's part (each player's claim) goes over
// the harness's relay. No domains given, as a GM pasting a link: the
// link's host (127.0.0.1) isn't the XMPP domain, Docker's names are.
serviceContract({
  screenShare: { audio: false },
  service: "jitsi",
  params: {
    url: JITSI_OPEN_DOCKER.serviceUrl,
    domain: "",
    muc: "",
    access: "open",
  },
  secrets: {},
  auth: "none",
  // Jitsi carries no publish rights: receivers refuse a blocked player.
  publishRights: "receivers",
  outage: jitsiOpenOutage,
  features: [],
});
