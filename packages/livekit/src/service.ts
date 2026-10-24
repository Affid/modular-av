import type { ServiceDefinition } from "@modular-av/api";
import { LiveKitServiceError } from "./failure.ts";
import type { Rooms } from "./rooms.ts";
import { type LiveKitSettings, MODULE_ID } from "./settings.ts";
import { signLiveKitToken } from "./token.ts";

export interface LiveKitServiceDeps {
  readonly settings: LiveKitSettings;
  readonly now: () => number;
  /** Where the joined room goes, for add-ons; none in tests. */
  readonly rooms?: Pick<Rooms, "set" | "clear">;
  readonly onError: (error: unknown) => void;
}

const NO_ROOMS: Pick<Rooms, "set" | "clear"> = {
  set: () => undefined,
  clear: () => undefined,
};

/** WebCrypto exists only in secure contexts (https, or localhost). */
const canUseWebCrypto = (): boolean =>
  typeof (globalThis.crypto as Partial<Crypto> | undefined)?.subtle
    ?.importKey === "function";

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
    needsToken: () => true,
    canSignTokens: () =>
      deps.settings.credentials() !== null && canUseWebCrypto(),
    signToken(request) {
      if (!canUseWebCrypto())
        return Promise.reject(
          new Error(
            "Signing LiveKit tokens needs a secure context: open Foundry over https:// (or localhost)",
          ),
        );
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
            "Set a wss:// LiveKit server URL in the module settings (ws:// only on a local network)",
        });
      const { createLiveKitConnection } = await import("./connection.ts");
      return createLiveKitConnection(context, {
        url,
        rooms: deps.rooms ?? NO_ROOMS,
        onError: deps.onError,
      });
    },
  };
}
