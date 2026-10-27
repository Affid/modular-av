import { serviceContract } from "@modular-av/testing/contract";
import {
  JITSI_DOCKER,
  jitsiOutage,
} from "../../../../scripts/services/jitsi.ts";

serviceContract({
  service: "jitsi",
  params: {
    url: JITSI_DOCKER.serviceUrl,
    domain: JITSI_DOCKER.domain,
    muc: JITSI_DOCKER.muc,
  },
  secrets: { appId: JITSI_DOCKER.appId, appSecret: JITSI_DOCKER.appSecret },
  // Jitsi tokens carry no publish rights: receivers refuse a blocked player.
  publishRights: "receivers",
  outage: jitsiOutage,
  features: [],
});
