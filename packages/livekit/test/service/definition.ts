import type { CreateDefinition } from "@modular-av/testing/harness/service";
import { createLiveKitService } from "../../src/service.ts";

/** For the service contract harness: the URL in the page, keys passed apart. */
export const createDefinition: CreateDefinition = (params, secrets) =>
  createLiveKitService({
    settings: {
      serverUrl: () => params.get("url"),
      credentials: () => ({
        apiKey: secrets.key ?? "",
        apiSecret: secrets.secret ?? "",
      }),
    },
    now: () => Date.now(),
    onError: (error) => {
      // eslint-disable-next-line no-console -- surfaces in Playwright's page log
      console.error(error instanceof Error ? error.name : "error");
    },
  });
