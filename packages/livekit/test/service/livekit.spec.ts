import { serviceContract } from "@modular-av/testing/contract";
import {
  LIVEKIT_DEV,
  livekitOutage,
} from "../../../../scripts/services/livekit.ts";

serviceContract({
  service: "livekit",
  params: {
    url: LIVEKIT_DEV.url,
    key: LIVEKIT_DEV.apiKey,
    secret: LIVEKIT_DEV.apiSecret,
  },
  outage: livekitOutage,
});
