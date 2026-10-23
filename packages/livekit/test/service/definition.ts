import type { CreateDefinition } from "@modular-av/testing/harness/service";
import { createLiveKitService } from "../../src/service.ts";

/** For the service contract harness: the server and dev keys come from the URL. */
export const createDefinition: CreateDefinition = (params) =>
  createLiveKitService({
    settings: {
      serverUrl: () => params.get("url"),
      credentials: () => ({
        apiKey: params.get("key") ?? "",
        apiSecret: params.get("secret") ?? "",
      }),
    },
    now: () => Date.now(),
    onError: (error) => {
      // eslint-disable-next-line no-console -- surfaces in Playwright's page log
      console.error(error);
    },
  });
