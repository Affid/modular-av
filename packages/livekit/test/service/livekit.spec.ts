import { serviceContract } from "@modular-av/testing/contract";
import {
  livekitOutage,
  livekitTarget,
} from "../../../../scripts/services/livekit.ts";

const target = livekitTarget();

serviceContract({
  service: "livekit",
  params: { url: target.url },
  secrets: { key: target.apiKey, secret: target.apiSecret },
  // LiveKit Cloud can't be paused from here.
  ...(target.cloud ? {} : { outage: livekitOutage }),
});
