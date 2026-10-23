import type { ServiceDefinition } from "@modular-av/api";
import { LiveKitServiceError } from "./failure.ts";
import { type LiveKitSettings, MODULE_ID } from "./settings.ts";
import { signLiveKitToken } from "./token.ts";

export interface LiveKitServiceDeps {
  readonly settings: LiveKitSettings;
  readonly now: () => number;
  readonly onError: (error: unknown) => void;
}

/**
 * What the module registers with the core: small on purpose. The SDK is
 * imported in `create()`, so it loads only when someone joins a call.
 */
export function createLiveKitService(
  deps: LiveKitServiceDeps,
): ServiceDefinition {
  return {
    id: "livekit",
    label: `${MODULE_ID}.label`,
    mediaOwnership: "core",
    canSignTokens: () => deps.settings.credentials() !== null,
    signToken(request) {
      const credentials = deps.settings.credentials();
      if (!credentials)
        return Promise.reject(
          new Error("No LiveKit key and secret on this device"),
        );
      return signLiveKitToken(request, credentials, deps.now());
    },
    async create(context) {
      const url = deps.settings.serverUrl();
      if (!url)
        throw new LiveKitServiceError({
          code: "unsupported",
          final: true,
          message:
            "Set the LiveKit server URL (ws:// or wss://) in the module settings",
        });
      const { createLiveKitConnection } = await import("./connection.ts");
      return createLiveKitConnection(context, { url, onError: deps.onError });
    },
  };
}
