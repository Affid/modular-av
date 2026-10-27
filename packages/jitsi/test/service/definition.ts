import type { CreateDefinition } from "@modular-av/testing/harness/service";
import { createJitsiService, MODULE_ID, SDK_PATH } from "../../src/service.ts";

/** For the service contract harness: the server in the page URL, the app secret apart. */
export const createDefinition: CreateDefinition = (params, secrets) =>
  createJitsiService({
    server: () => ({
      serviceUrl: params.get("url") ?? "",
      domain: params.get("domain") ?? "",
      muc: params.get("muc") ?? "",
    }),
    credentials: () => ({
      appId: secrets.appId ?? "",
      appSecret: secrets.appSecret ?? "",
    }),
    sdkUrl: () => `/modules/${MODULE_ID}/${SDK_PATH}`,
    now: () => Date.now(),
    onLibraryLog: (line) => {
      // eslint-disable-next-line no-console -- surfaces in Playwright's page log
      console.warn(line);
    },
    onError: (error) => {
      // eslint-disable-next-line no-console -- surfaces in Playwright's page log
      console.error(error instanceof Error ? error.message : "error");
    },
  });
